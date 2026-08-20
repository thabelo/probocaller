import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyResultsService } from './survey-results.service';
import { SettingsReaderService } from '../config/settings-reader.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { DataAccessLog } from '../profile/data-access-log.entity';

/**
 * What a business gets back for the answers it paid for.
 *
 * Everything here is downstream of one promise: a business sees how people
 * answered, never how one person answered. The tests below are mostly about
 * the ways that promise can be broken by accident — a column left in a SELECT,
 * a number that moves by one when a single new answer lands, a verbatim keyed
 * back to the response it came from.
 */
describe('SurveyResultsService', () => {
  let service: SurveyResultsService;
  let surveyRepo: any;
  let questionRepo: any;
  let fieldRepo: any;
  let accessLogRepo: any;
  let query: jest.Mock;

  const LIVE = (over: Record<string, unknown> = {}) => ({
    id: 41,
    businessId: 7,
    title: 'Branch experience',
    status: 'live',
    filtersJson: { province: 'gp' },
    targetResponses: 50,
    resultsCohortLogged: 0,
    business: { userId: 1 },
    ...over,
  });

  const QUESTIONS = [
    { id: 310, surveyId: 41, type: 'yes_no', prompt: 'Helped within 10 minutes?', position: 0, required: true, optionsJson: null },
    { id: 311, surveyId: 41, type: 'multiple_choice', prompt: 'Which branch?', position: 1, required: true, optionsJson: ['Sandton', 'Randburg', 'Soweto', 'Midrand'] },
  ];

  /**
   * The service reaches the database through raw grouped SQL, never through
   * entity hydration, so the fake is keyed on what each statement asks for.
   */
  const db = (over: Record<string, any> = {}) => {
    const plan = {
      submitted: 20,
      single: [
        { questionId: 310, value: 'yes', count: 14 },
        { questionId: 310, value: 'no', count: 6 },
        { questionId: 311, value: 'Sandton', count: 12 },
        { questionId: 311, value: 'Randburg', count: 8 },
      ],
      multi: [],
      answered: [
        { questionId: 310, answered: 20 },
        { questionId: 311, answered: 20 },
      ],
      verbatims: [],
      cohortUsers: [{ userId: 501, amountPaid: '3.00' }],
      ...over,
    };
    return jest.fn(async (sql: string) => {
      // Every answer query names survey_responses too, in the cohort subquery,
      // so branch on the answers table FIRST or the submitted-count arm eats
      // all of them.
      if (/survey_answers/i.test(sql)) {
        if (/jsonb_array_elements_text/i.test(sql)) return plan.multi;
        if (/count\(distinct/i.test(sql)) return plan.answered;
        if (/free_text/i.test(sql)) return plan.verbatims;
        return plan.single;
      }
      if (/count\(\*\)/i.test(sql)) return [{ count: plan.submitted }];
      if (/"userId"/i.test(sql)) return plan.cohortUsers;
      return [];
    });
  };

  const build = async (surveyOver = {}, dbOver = {}) => {
    query = db(dbOver);
    surveyRepo = {
      findOne: jest.fn().mockResolvedValue(LIVE(surveyOver)),
      save: jest.fn(async (r: any) => r),
    };
    questionRepo = { find: jest.fn().mockResolvedValue(QUESTIONS) };
    fieldRepo = {
      find: jest.fn().mockResolvedValue([
        { key: 'province', label: 'Province', options: [{ value: 'gp', label: 'Gauteng' }] },
      ]),
    };
    accessLogRepo = { save: jest.fn(async (r: any) => r), create: jest.fn((r: any) => r) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyResultsService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: getRepositoryToken(ProfileField), useValue: fieldRepo },
        { provide: getRepositoryToken(DataAccessLog), useValue: accessLogRepo },
        { provide: SettingsReaderService, useValue: { getNumber: jest.fn(async () => NaN) } },
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();

    service = mod.get(SurveyResultsService);
    return service;
  };

  describe('who may read them', () => {
    it('returns results for a survey I own', async () => {
      await build();
      const out = await service.forBusiness(1, 41);
      expect(out.surveyId).toBe(41);
      expect(out.release.state).toBe('released');
    });

    it('refuses results for a survey that belongs to someone else', async () => {
      await build({ business: { userId: 99 } });
      await expect(service.forBusiness(1, 41)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('how much is released', () => {
    it('withholds everything until the release threshold is reached', async () => {
      await build({}, { submitted: 6 });
      const out = await service.forBusiness(1, 41);
      expect(out.release.state).toBe('withheld');
      expect(out.release.responsesNeeded).toBe(4);
      expect(out.questions).toEqual([]);
    });

    /**
     * The whole defence against polling. If the numbers moved with each new
     * answer, a business refreshing the page would read each arrival by
     * subtracting the previous view from the current one — the anonymity of a
     * distribution undone by watching it change.
     */
    it('reports answers only for whole cohorts of ten', async () => {
      await build({}, { submitted: 23 });
      const out = await service.forBusiness(1, 41);
      expect(out.release.responsesSubmitted).toBe(23);
      expect(out.release.responsesReleased).toBe(20);
      expect(out.release.nextReleaseAt).toBe(30);
    });

    it('says nothing at all about a draft', async () => {
      await build({ status: 'draft' });
      const out = await service.forBusiness(1, 41);
      expect(out.release.state).toBe('not_published');
      expect(out.questions).toEqual([]);
    });

    it('explains a closed survey that never gathered enough to report', async () => {
      await build({ status: 'closed' }, { submitted: 7 });
      const out = await service.forBusiness(1, 41);
      expect(out.release.state).toBe('never_released');
      expect(out.questions).toEqual([]);
    });

    it('takes the cohort as the oldest responses by submitted time then id', async () => {
      await build({}, { submitted: 23 });
      await service.forBusiness(1, 41);
      const sql = query.mock.calls.map(([s]: any[]) => s).join('\n');
      expect(sql).toMatch(/order by[\s\S]*"submittedAt" asc[\s\S]*"id" asc/i);
    });
  });

  describe('the payload itself', () => {
    it('echoes the survey filters as targeting and attaches no demographics to any answer', async () => {
      await build();
      const out = await service.forBusiness(1, 41);
      expect(out.targeting.bands).toEqual([
        { field: 'province', label: 'Province', values: ['Gauteng'] },
      ]);
      expect(out.breakdowns).toEqual([]);
      for (const q of out.questions) {
        expect(q).not.toHaveProperty('demographics');
      }
    });

    it('counts a yes/no question against its two answers', async () => {
      await build();
      const out = await service.forBusiness(1, 41);
      const q = out.questions.find((x: any) => x.questionId === 310)!;
      expect(q.state).toBe('shown');
      expect(q.cells).toEqual([
        { value: 'yes', label: 'Yes', count: 14, percent: 70, suppressed: false },
        { value: 'no', label: 'No', count: 6, percent: 30, suppressed: false },
      ]);
    });

    /**
     * An option nobody picked has to appear as a zero. Dropping it would leave
     * the business unable to tell "nobody chose Midrand" — a real finding it
     * paid for — from "Midrand was held back".
     */
    it('shows an option nobody chose as a zero rather than omitting it', async () => {
      await build();
      const out = await service.forBusiness(1, 41);
      const q = out.questions.find((x: any) => x.questionId === 311)!;
      expect(q.cells.map((c: any) => c.value)).toEqual(['Sandton', 'Randburg', 'Soweto', 'Midrand']);
      expect(q.cells[3]).toMatchObject({ count: 0, suppressed: false });
    });

    it('reads valueJson for a multi-select and valueText for every other type', async () => {
      await build({}, {
        multi: [{ questionId: 311, value: 'Sandton', count: 12 }],
      });
      await service.forBusiness(1, 41);
      const sql = query.mock.calls.map(([s]: any[]) => s).join('\n');
      expect(sql).toMatch(/jsonb_array_elements_text\(\s*a\."valueJson"\s*\)/i);
      expect(sql).toMatch(/a\."valueText"/i);
    });
  });

  /**
   * The promise is only as good as the columns that never get selected. These
   * two turn "we didn't put an identity in the payload" from an absence into
   * something that fails loudly the day someone adds a join.
   */
  describe('structural guards', () => {
    it('never lets an identity or a timestamp into a results payload', async () => {
      await build({}, { submitted: 23 });
      const out = await service.forBusiness(1, 41);
      expect(JSON.stringify(out)).not.toMatch(/userId|responseId|submittedAt|startedAt|amountPaid/);
    });

    /**
     * Aggregate USE of an identity column is fine — COUNT(DISTINCT responseId)
     * yields a number, not an id. What must never appear is an identity column
     * PROJECTED as a value, which is what a future join would add.
     */
    it('never projects an identity column out of an answers query', async () => {
      await build();
      await service.forBusiness(1, 41);
      const selects = query.mock.calls
        .map(([s]: any[]) => s as string)
        .filter((s) => /survey_answers/i.test(s))
        .map((s) => s.slice(s.toLowerCase().indexOf('select'), s.toLowerCase().indexOf('from')))
        // Drop aggregate calls; what is left is the raw projection.
        .map((s) => s.replace(/\b(count|sum|min|max|avg)\s*\([\s\S]*?\)/gi, ''));
      expect(selects.length).toBeGreaterThan(0);
      for (const select of selects) {
        expect(select).not.toMatch(/"userId"|"responseId"|"submittedAt"|"startedAt"|"amountPaid"/);
      }
    });
  });

  describe('written answers', () => {
    const WITH_TEXT = [
      ...QUESTIONS,
      { id: 313, surveyId: 41, type: 'free_text', prompt: 'What would have improved it?', position: 2, required: false, optionsJson: null },
    ];

    it('holds written answers back until the survey closes', async () => {
      await build();
      questionRepo.find.mockResolvedValue(WITH_TEXT);
      const out = await service.forBusiness(1, 41);
      const q = out.questions.find((x: any) => x.questionId === 313)!;
      expect(q.state).toBe('pending_close');
      expect(q.verbatims).toEqual([]);
      expect(out.release.verbatims).toBe('pending_close');
    });

    it('releases redacted written answers once the survey has closed', async () => {
      await build({ status: 'closed' }, {
        answered: [{ questionId: 310, answered: 20 }, { questionId: 311, answered: 20 }, { questionId: 313, answered: 20 }],
        verbatims: [
          { questionId: 313, valueText: 'Call me on 0821234567' },
          { questionId: 313, valueText: 'The queue was long' },
        ],
      });
      questionRepo.find.mockResolvedValue(WITH_TEXT);
      const out = await service.forBusiness(1, 41);
      const q = out.questions.find((x: any) => x.questionId === 313)!;
      expect(out.release.verbatims).toBe('released');
      expect(q.verbatims).toHaveLength(2);
      expect(q.verbatims.join(' ')).toMatch(/\[removed\]/);
      expect(q.verbatims.join(' ')).not.toMatch(/0821234567/);
    });

    it('withholds written answers for a question fewer than ten people answered', async () => {
      await build({ status: 'closed' }, {
        answered: [{ questionId: 310, answered: 20 }, { questionId: 311, answered: 20 }, { questionId: 313, answered: 4 }],
        verbatims: [{ questionId: 313, valueText: 'anything' }],
      });
      questionRepo.find.mockResolvedValue(WITH_TEXT);
      const out = await service.forBusiness(1, 41);
      expect(out.questions.find((x: any) => x.questionId === 313)!.verbatims).toEqual([]);
    });
  });

  describe('the respondent’s own record', () => {
    it('records an access-log row for each respondent whose answers were released', async () => {
      await build();
      await service.forBusiness(1, 41);
      expect(accessLogRepo.save).toHaveBeenCalled();
      const [row] = accessLogRepo.save.mock.calls[0];
      expect(row).toMatchObject({ userId: 501, businessId: 7, purpose: 'survey_results' });
    });

    it('does not record the same cohort twice', async () => {
      await build({ resultsCohortLogged: 20 });
      await service.forBusiness(1, 41);
      expect(accessLogRepo.save).not.toHaveBeenCalled();
    });

    it('remembers how much it has logged, so a refresh writes nothing new', async () => {
      await build();
      await service.forBusiness(1, 41);
      expect(surveyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resultsCohortLogged: 20 }),
      );
    });
  });
});
