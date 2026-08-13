import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { SurveyResponse } from './survey-response.entity';
import { SurveyAnswer } from './survey-answer.entity';
import { User } from '../user/user.entity';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { isMultiSelect } from './question-type';

const toCents = (amount: number) => Math.round(amount * 100) / 100;

export interface AnswerInput {
  questionId: number;
  valueText?: string | null;
  valueJson?: unknown;
}

/**
 * The respondent side: what someone is offered, and what happens when they
 * finish (build-order step 4).
 *
 * Paid on COMPLETION (§1.3) — answering six of ten questions and abandoning
 * earns nothing and costs the business nothing. Payment is drawn from the pot
 * the survey escrowed at publish, so someone who finishes is always paid.
 *
 * `userId` is used here for payment and de-duplication only. Nothing on this
 * path may hand it to a business (§2.1).
 */
@Injectable()
export class SurveyResponseService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepository: Repository<SurveyQuestion>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(SurveyAnswer)
    private readonly answerRepository: Repository<SurveyAnswer>,
    private readonly matching: SurveyMatchingService,
    private readonly transactions: TransactionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Live surveys this person matches and has not answered.
   *
   * Each carries what it PAYS and how many questions it asks, because a
   * respondent must know both before starting — App Detail promises "Each
   * survey states what it pays before you start."
   */
  async available(userId: number) {
    const live = await this.surveyRepository.find({
      where: { status: 'live' },
      order: { publishedAt: 'DESC' },
    });
    if (!live.length) return [];

    const answered = new Set(
      (await this.responseRepository.find({ where: { userId }, select: ['surveyId'] }))
        .map((r) => r.surveyId),
    );

    const offered: any[] = [];
    for (const survey of live) {
      if (answered.has(survey.id)) continue;

      const audience = await this.matching.audience(survey.filtersJson ?? {});
      if (!audience.includes(userId)) continue;

      const questions = await this.questionRepository.find({
        where: { surveyId: survey.id },
        order: { position: 'ASC' },
      });

      offered.push({
        id: survey.id,
        title: survey.title,
        description: survey.description,
        category: survey.category,
        pays: Number(survey.pricePerResponse),
        questionCount: questions.length,
        questions,
        expiresAt: survey.expiresAt,
      });
    }
    return offered;
  }

  /**
   * Answer a survey and get paid, in one transaction.
   *
   * Everything is checked before any money moves: the survey is live and still
   * has responses left to buy, this person is targeted, they have not answered
   * before, and every required question has a usable answer.
   */
  async submit(userId: number, surveyId: number, answers: AnswerInput[]) {
    const existing = await this.responseRepository.findOne({ where: { surveyId, userId } });
    if (existing?.submittedAt) {
      throw new BadRequestException('You have already answered this survey.');
    }

    const audience = await this.matching.audience(
      (await this.surveyRepository.findOne({ where: { id: surveyId } }))?.filtersJson ?? {},
    );
    if (!audience.includes(userId)) {
      throw new ForbiddenException('This survey is not open to you.');
    }

    const questions = await this.questionRepository.find({
      where: { surveyId },
      order: { position: 'ASC' },
    });

    return this.dataSource.transaction(async (manager) => {
      // Lock the survey row: two people submitting the last response at once
      // must not both be paid out of a pot that only covers one.
      const survey = await manager.findOne(Survey, {
        where: { id: surveyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!survey) throw new NotFoundException('Survey not found');
      if (survey.status !== 'live') {
        throw new BadRequestException('This survey is no longer taking responses.');
      }

      const price = Number(survey.pricePerResponse);
      const paid = Number(survey.totalPaid ?? 0);
      const delivered = price > 0 ? Math.round(paid / price) : 0;
      if (delivered >= survey.targetResponses) {
        // The pot is finite: past the target there is no money left to pay for
        // another completion, which is precisely what escrow exists to prevent.
        throw new BadRequestException('This survey already has all the responses it asked for.');
      }

      this.validateAnswers(questions, answers);

      const response = await manager.save(SurveyResponse, manager.create(SurveyResponse, {
        ...(existing ?? {}),
        surveyId,
        userId,
        startedAt: existing?.startedAt ?? new Date(),
        submittedAt: new Date(),
        amountPaid: String(price),
      }));

      for (const answer of answers) {
        await manager.save(SurveyAnswer, manager.create(SurveyAnswer, {
          responseId: response.id,
          questionId: answer.questionId,
          valueText: answer.valueText ?? null,
          valueJson: answer.valueJson ?? null,
        }));
      }

      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');

      user.walletBalance = toCents(Number(user.walletBalance ?? 0) + price) as any;
      await manager.save(User, user);

      survey.totalPaid = String(toCents(paid + price));
      await manager.save(Survey, survey);

      await this.transactions.log(
        userId,
        'SURVEY_EARNING',
        price,
        `Completed survey "${survey.title}"`,
        undefined,
        manager,
      );

      return { responseId: response.id, earned: price };
    });
  }

  /**
   * Every required question answered, with a value its type can actually hold.
   * Runs before any money moves — a rejected submission must cost nobody
   * anything.
   */
  private validateAnswers(questions: SurveyQuestion[], answers: AnswerInput[]): void {
    const byId = new Map(questions.map((q) => [q.id, q]));

    for (const answer of answers) {
      if (!byId.has(answer.questionId)) {
        throw new BadRequestException(`Question ${answer.questionId} is not part of this survey.`);
      }
    }

    const answerFor = new Map(answers.map((a) => [a.questionId, a]));

    for (const question of questions) {
      const answer = answerFor.get(question.id);
      const multi = isMultiSelect(question.type);

      if (!answer) {
        if (question.required) {
          throw new BadRequestException(`Question ${question.id} still needs an answer.`);
        }
        continue;
      }

      const chosen = Array.isArray(answer.valueJson) ? (answer.valueJson as unknown[]) : null;

      if (!multi && chosen) {
        throw new BadRequestException(
          `Question ${question.id} takes a single answer, not several.`,
        );
      }

      const blank = multi
        ? !chosen?.length
        : !String(answer.valueText ?? '').trim();
      if (blank && question.required) {
        throw new BadRequestException(`Question ${question.id} still needs an answer.`);
      }

      // A chosen option must be one the question actually offered — otherwise
      // the business is paying for an answer to a question it never asked.
      const options = question.optionsJson;
      if (options?.length) {
        const picked = chosen ?? [answer.valueText];
        for (const value of picked) {
          if (value != null && !options.includes(String(value))) {
            throw new BadRequestException(
              `"${value}" is not one of the options for question ${question.id}.`,
            );
          }
        }
      }
    }
  }
}
