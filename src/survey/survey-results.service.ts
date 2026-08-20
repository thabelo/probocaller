import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { DataAccessLog } from '../profile/data-access-log.entity';
import { SettingsReaderService } from '../config/settings-reader.service';
import { readResultThresholds } from './survey-results.thresholds';
import { ResultCell, suppressDistribution } from './survey-results.suppression';
import { redactFreeText } from './free-text-redaction';
import { isMultiSelect } from './question-type';

/**
 * What a business gets back for the answers it paid for.
 *
 * The unit of this payload is the QUESTION, never the response. There is no
 * respondent axis anywhere in the shape below, which is what makes
 * "whoever said they have no medical aid also said they are looking for work"
 * unanswerable — not filtered out, but with nowhere to live in the first
 * place. That is deliberate and it is the single most important property of
 * this file: a future change that returns rows instead of distributions would
 * have to invent the axis, which is a visible thing to review.
 *
 * Three rules do the rest:
 *   - nothing is reported until `releaseThreshold` answers are in;
 *   - answers are released in whole cohorts, so refreshing the page can never
 *     read a new arrival by subtracting the old view from the new one;
 *   - within a cohort, any group smaller than `minCell` is held back
 *     (survey-results.suppression.ts).
 *
 * NO SurveyResponse OR SurveyAnswer ENTITY IS EVER HYDRATED HERE. Every read
 * is grouped SQL whose SELECT list physically contains no identity column, so
 * a field cannot be left in by accident — someone would have to write a new
 * query to leak one, and survey-results.service.spec.ts asserts against that.
 */
export interface ResultTargeting {
  filters: Record<string, unknown>;
  bands: Array<{ field: string; label: string; values: string[] }>;
}

export interface ResultRelease {
  /**
   * `withheld` still needs more answers; `never_released` stopped before it
   * ever had enough and was refunded. Both carry no questions, and a client
   * has to say different things about them.
   */
  state: 'not_published' | 'withheld' | 'released' | 'never_released';
  responsesSubmitted: number;
  responsesReleased: number;
  responsesTarget: number;
  /** How many more answers before anything is shown. `withheld` only. */
  responsesNeeded?: number;
  /** The answer count at which the next cohort opens. `released` only. */
  nextReleaseAt?: number;
  refunded?: boolean;
  /** The live numbers, so no client hardcodes "10" or "5" in its copy. */
  releaseThreshold: number;
  batchSize: number;
  minimumCellSize: number;
  verbatims: 'pending_close' | 'released';
}

export interface SurveyResults {
  surveyId: number;
  title: string;
  status: string;
  release: ResultRelease;
  targeting: ResultTargeting;
  /** Permanently empty. Cross-tabs need a suppression rule across BOTH
   *  margins before they could ever be safe; shipping the key keeps the shape
   *  stable if that work is ever done. */
  breakdowns: unknown[];
  questions: ResultQuestion[];
}

export interface ResultQuestion {
  questionId: number;
  position: number;
  type: string;
  prompt: string;
  required: boolean;
  answered: number;
  state: string;
  cells: ResultCell[];
  heldReason?: string;
  verbatims?: string[];
}

@Injectable()
export class SurveyResultsService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepository: Repository<SurveyQuestion>,
    @InjectRepository(ProfileField)
    private readonly fieldRepository: Repository<ProfileField>,
    @InjectRepository(DataAccessLog)
    private readonly accessLogRepository: Repository<DataAccessLog>,
    private readonly settingsReader: SettingsReaderService,
    private readonly dataSource: DataSource,
  ) {}

  async forBusiness(userId: number, surveyId: number): Promise<SurveyResults> {
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
      relations: ['business'],
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (!survey.business || survey.business.userId !== userId) {
      throw new ForbiddenException('This survey does not belong to your account.');
    }

    const thresholds = await readResultThresholds(this.settingsReader);
    const targeting = await this.targeting(survey);
    const base = {
      surveyId: survey.id,
      title: survey.title,
      status: survey.status,
      targeting,
      breakdowns: [] as unknown[],
    };

    const limits = {
      releaseThreshold: thresholds.releaseThreshold,
      batchSize: thresholds.batch,
      minimumCellSize: thresholds.minCell,
    };

    if (survey.status === 'draft') {
      return {
        ...base,
        release: {
          state: 'not_published',
          responsesSubmitted: 0,
          responsesReleased: 0,
          responsesTarget: survey.targetResponses,
          verbatims: 'pending_close',
          ...limits,
        },
        questions: [],
      };
    }

    const submitted = await this.countSubmitted(survey.id);
    // Whole cohorts only. A part-cohort would move the published numbers by
    // one each time a response landed, and the difference between two views is
    // exactly one person's answers.
    const released = Math.floor(submitted / thresholds.batch) * thresholds.batch;
    const terminal = survey.status === 'closed' || survey.status === 'expired';

    const release = {
      responsesSubmitted: submitted,
      responsesReleased: released,
      responsesTarget: survey.targetResponses,
      ...limits,
      verbatims: (terminal ? 'released' : 'pending_close') as ResultRelease['verbatims'],
    };

    if (released < thresholds.releaseThreshold) {
      // A survey that has stopped will never reach the threshold, so say so
      // plainly rather than leaving a business waiting on a number that can no
      // longer move.
      return {
        ...base,
        release: terminal
          ? { ...release, state: 'never_released', refunded: true }
          : {
              ...release,
              state: 'withheld',
              responsesNeeded: thresholds.releaseThreshold - submitted,
            },
        questions: [],
      };
    }

    const questions = await this.questionRepository.find({
      where: { surveyId: survey.id },
      order: { position: 'ASC' },
    });

    const [single, multi, answeredRows] = await Promise.all([
      this.singleValueCounts(survey.id, released),
      this.multiSelectCounts(survey.id, released),
      this.answeredCounts(survey.id, released),
    ]);
    const verbatimRows = terminal ? await this.verbatims(survey.id, released) : [];

    const answeredBy = new Map<number, number>(
      answeredRows.map((r) => [Number(r.questionId), Number(r.answered)]),
    );

    const built = questions.map((question) =>
      this.buildQuestion(question, {
        answered: answeredBy.get(question.id) ?? 0,
        single,
        multi,
        verbatimRows,
        terminal,
        thresholds,
      }),
    );

    await this.recordDisclosure(survey, released);

    return { ...base, release: { ...release, state: 'released', nextReleaseAt: released + thresholds.batch }, questions: built };
  }

  private buildQuestion(
    question: SurveyQuestion,
    ctx: {
      answered: number;
      single: RawCount[];
      multi: RawCount[];
      verbatimRows: RawVerbatim[];
      terminal: boolean;
      thresholds: { minCell: number; releaseThreshold: number; batch: number };
    },
  ): ResultQuestion {
    const shell = {
      questionId: question.id,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
      required: question.required,
      answered: ctx.answered,
    };

    if (question.type === 'free_text') {
      // Written answers are the one place a respondent can identify themselves
      // in their own words, and no redaction pass catches that. They are held
      // until the survey stops so that a single release cannot be diffed
      // against an earlier one, then delivered unkeyed and shuffled, so two
      // answers from one person cannot be read back as one person.
      const pool = ctx.terminal && ctx.answered >= ctx.thresholds.releaseThreshold
        ? shuffle(
            ctx.verbatimRows
              .filter((v) => Number(v.questionId) === question.id)
              .map((v) => redactFreeText(v.valueText ?? '').text)
              .filter((t) => t.trim().length > 0),
            question.id,
          )
        : [];
      return {
        ...shell,
        state: ctx.terminal ? 'released' : 'pending_close',
        cells: [],
        verbatims: pool,
      };
    }

    const partitions = !isMultiSelect(question.type);
    const rows = (partitions ? ctx.single : ctx.multi).filter(
      (r) => Number(r.questionId) === question.id,
    );
    const counted = new Map<string, number>(
      rows.map((r) => [normalise(r.value), Number(r.count)]),
    );

    // The option universe comes from the QUESTION, not from what people
    // happened to choose: an option nobody picked must show as a zero, or the
    // business cannot tell "nobody chose Midrand" from "Midrand was held back".
    const universe = optionsFor(question);
    const cells = universe.map((option) => ({
      value: option.value,
      label: option.label,
      count: counted.get(normalise(option.value)) ?? 0,
    }));

    // Anything stored that no longer matches an option — a renamed choice, a
    // value written before an edit — is collected rather than dropped, so the
    // counts still add up to `answered`, and it obeys the same rules as any
    // other cell.
    const known = new Set(universe.map((o) => normalise(o.value)));
    const strayTotal = [...counted.entries()]
      .filter(([value]) => !known.has(value))
      .reduce((sum, [, count]) => sum + count, 0);
    if (strayTotal > 0) cells.push({ value: '(other)', label: 'Other', count: strayTotal });

    const { cells: out, state, heldReason } = suppressDistribution(cells, {
      minCell: ctx.thresholds.minCell,
      answered: ctx.answered,
      partitions,
    });

    return { ...shell, state, cells: out, ...(heldReason ? { heldReason } : {}) };
  }

  /**
   * The bands the business itself chose, resolved to labels.
   *
   * An ECHO, not an attribution: this is information the business supplied,
   * carrying no new bits about anybody. No demographic is ever attached to an
   * answer, and `breakdowns` ships as a permanently empty array so the shape
   * does not change if cross-tabs are ever considered — which would need a
   * suppression rule across both margins before it could be safe.
   */
  private async targeting(survey: Survey) {
    const filters = survey.filtersJson ?? {};
    const keys = Object.keys(filters);
    if (!keys.length) return { filters, bands: [] };

    const fields = await this.fieldRepository.find();
    const byKey = new Map(fields.map((f) => [f.key, f]));

    return {
      filters,
      bands: keys.map((key) => {
        const field = byKey.get(key);
        const wanted = filters[key];
        const values = (Array.isArray(wanted) ? wanted : [wanted]).map((value) => {
          const option = field?.options?.find((o) => o.value === value);
          return option?.label ?? String(value);
        });
        return { field: key, label: field?.label ?? key, values };
      }),
    };
  }

  /**
   * One line in each respondent's own access log the first time a cohort
   * containing them is released.
   *
   * Survey targeting writes nothing to data_access_logs today, so a user's
   * access log shows a business that bought their profile but not one that
   * surveyed them — and every mitigation in this design leans on that trail
   * being complete. Idempotent on the cohort boundary: refreshing the results
   * page re-reads the same numbers and writes nothing.
   */
  private async recordDisclosure(survey: Survey, released: number): Promise<void> {
    const alreadyLogged = survey.resultsCohortLogged ?? 0;
    if (released <= alreadyLogged) return;

    const rows: Array<{ userId: number; amountPaid: string }> = await this.dataSource.query(
      `SELECT r."userId" AS "userId", r."amountPaid" AS "amountPaid"
         FROM survey_responses r
        WHERE r."surveyId" = $1 AND r."submittedAt" IS NOT NULL
        ORDER BY r."submittedAt" ASC, r."id" ASC
        OFFSET $2 LIMIT $3`,
      [survey.id, alreadyLogged, released - alreadyLogged],
    );

    for (const row of rows) {
      await this.accessLogRepository.save(
        this.accessLogRepository.create({
          userId: Number(row.userId),
          businessId: survey.businessId,
          fieldsAccessed: Object.keys(survey.filtersJson ?? {}),
          purpose: 'survey_results',
          // The business already paid at publish and the respondent was already
          // paid on submission; this row records the disclosure, not a charge.
          creditsCost: 0,
          userEarnings: Number(row.amountPaid ?? 0),
        } as Partial<DataAccessLog>),
      );
    }

    survey.resultsCohortLogged = released;
    await this.surveyRepository.save(survey);
  }

  private async countSubmitted(surveyId: number): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM survey_responses r
        WHERE r."surveyId" = $1 AND r."submittedAt" IS NOT NULL`,
      [surveyId],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * The cohort, as a subquery. The response ids never leave the database —
   * there is no point in this service where a list of them exists in memory.
   */
  private cohort(): string {
    return `SELECT r."id" FROM survey_responses r
             WHERE r."surveyId" = $1 AND r."submittedAt" IS NOT NULL
             ORDER BY r."submittedAt" ASC, r."id" ASC
             LIMIT $2`;
  }

  private singleValueCounts(surveyId: number, released: number): Promise<RawCount[]> {
    return this.dataSource.query(
      `SELECT a."questionId" AS "questionId", a."valueText" AS "value", COUNT(*)::int AS "count"
         FROM survey_answers a
        WHERE a."responseId" IN (${this.cohort()})
          AND a."valueText" IS NOT NULL
        GROUP BY a."questionId", a."valueText"`,
      [surveyId, released],
    );
  }

  private multiSelectCounts(surveyId: number, released: number): Promise<RawCount[]> {
    return this.dataSource.query(
      `SELECT a."questionId" AS "questionId", v.value AS "value", COUNT(*)::int AS "count"
         FROM survey_answers a
         CROSS JOIN LATERAL jsonb_array_elements_text( a."valueJson" ) AS v(value)
        WHERE a."responseId" IN (${this.cohort()})
          AND a."valueJson" IS NOT NULL
        GROUP BY a."questionId", v.value`,
      [surveyId, released],
    );
  }

  private answeredCounts(surveyId: number, released: number): Promise<RawAnswered[]> {
    return this.dataSource.query(
      `SELECT a."questionId" AS "questionId", COUNT(DISTINCT a."responseId")::int AS "answered"
         FROM survey_answers a
        WHERE a."responseId" IN (${this.cohort()})
        GROUP BY a."questionId"`,
      [surveyId, released],
    );
  }

  private verbatims(surveyId: number, released: number): Promise<RawVerbatim[]> {
    return this.dataSource.query(
      `SELECT a."questionId" AS "questionId", a."valueText" AS "valueText"
         FROM survey_answers a
         JOIN survey_questions q ON q."id" = a."questionId"
        WHERE a."responseId" IN (${this.cohort()})
          AND q."type" = 'free_text'
          AND a."valueText" IS NOT NULL`,
      [surveyId, released],
    );
  }
}

interface RawCount { questionId: number | string; value: string; count: number | string }
interface RawAnswered { questionId: number | string; answered: number | string }
interface RawVerbatim { questionId: number | string; valueText: string | null }

/** yes_no stores its answers as plain text and carries no optionsJson. */
function optionsFor(question: SurveyQuestion): Array<{ value: string; label: string }> {
  if (question.type === 'yes_no') {
    return [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  }
  return (question.optionsJson ?? []).map((value) => ({ value, label: value }));
}

/** Stored answers are user-entered strings; match them the way people typed them. */
function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Shuffle the verbatims for one question with a seed derived from the question
 * itself, so the order is stable across reads but tells nobody anything.
 *
 * Stable matters: an order that changed on every refresh would let a business
 * diff two views, and an order that followed submission time would hand back
 * exactly the arrival sequence the cohort rule exists to hide.
 */
function shuffle(items: string[], seed: number): string[] {
  const out = [...items];
  let state = (seed * 2654435761) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
