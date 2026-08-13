import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { Business } from '../business/business.entity';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { QuestionType, feeSettingKey } from './question-type';

/** Round to cents, so a hold and its refunds still reconcile. */
const toCents = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Publishing, closing and expiring — where surveys move money (§1.2).
 *
 * Publishing debits the business's wallet by the full quoted total (the
 * respondent pot PLUS the platform cut) and records it as held. Respondents
 * are paid from that pot as they complete; whatever is unspent is refunded in
 * the SAME transaction that closes or expires the survey.
 *
 * That arrangement is what makes both promises true at once: a respondent who
 * completes a survey is always paid, and a business can never overspend.
 * Charging per response as they arrived would let someone finish a survey the
 * business could no longer fund.
 */
@Injectable()
export class SurveyPublishService {
  private readonly logger = new Logger(SurveyPublishService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepository: Repository<SurveyQuestion>,
    private readonly pricing: SurveyPricingService,
    private readonly matching: SurveyMatchingService,
    private readonly transactions: TransactionService,
    private readonly dataSource: DataSource,
  ) {}

  private async ownedSurvey(userId: number, id: number): Promise<Survey> {
    const survey = await this.surveyRepository.findOne({ where: { id }, relations: ['business'] });
    if (!survey) throw new NotFoundException('Survey not found');
    if (!survey.business || survey.business.userId !== userId) {
      throw new ForbiddenException('This survey does not belong to your account.');
    }
    return survey;
  }

  /**
   * Take the money and go live.
   *
   * A narrow filter does NOT block publishing — the business is told how many
   * people it can actually reach and the unfilled remainder refunds on expiry.
   * Blocking would leave a business stuck with no clear way forward; saying
   * nothing would let it pay for responses that were never reachable.
   */
  async publish(userId: number, surveyId: number) {
    const survey = await this.ownedSurvey(userId, surveyId);
    if (survey.status !== 'draft') {
      throw new BadRequestException(`This survey is already ${survey.status}.`);
    }

    const questions = await this.questionRepository.find({
      where: { surveyId },
      order: { position: 'ASC' },
    });
    if (!questions.length) {
      throw new BadRequestException('A survey needs at least one question before it can go live.');
    }

    const quote = await this.pricing.quote(
      questions.map((q) => q.type as QuestionType),
      survey.targetResponses,
    );
    const audienceSize = await this.matching.estimateAudience(survey.filtersJson ?? {});

    // Per-type rates, frozen onto each question so an admin retuning a rate
    // later cannot change what this survey owes.
    const feeByType = new Map<string, number>();
    await Promise.all(
      [...new Set(questions.map((q) => q.type))].map(async (type) =>
        feeByType.set(type, await this.pricing.pricePerResponse([type as QuestionType])),
      ),
    );

    await this.dataSource.transaction(async (manager) => {
      const business = await manager.findOne(Business, {
        where: { id: survey.businessId },
        lock: { mode: 'pessimistic_write' },
        // Business eagerly joins its numbers; FOR UPDATE can't lock across that
        // LEFT JOIN (Postgres), so read the bare row.
        loadEagerRelations: false,
      });
      if (!business) throw new NotFoundException('Business not found');

      const balance = Number(business.walletBalance ?? 0);
      if (balance < quote.total) {
        throw new BadRequestException(
          `This survey costs ${quote.total.toFixed(2)} to publish and the wallet holds ${balance.toFixed(2)}. Top up, or ask for fewer responses.`,
        );
      }

      business.walletBalance = toCents(balance - quote.total) as any;
      await manager.save(Business, business);

      survey.status = 'live';
      survey.publishedAt = new Date();
      survey.pricePerResponse = String(quote.pricePerResponse);
      survey.totalHeld = String(quote.total);
      survey.totalPaid = '0';
      await manager.save(Survey, survey);

      for (const question of questions) {
        question.feeAtPublish = String(feeByType.get(question.type) ?? 0);
        await manager.save(SurveyQuestion, question);
      }

      await this.transactions.log(
        userId,
        'SURVEY_ESCROW_HELD',
        quote.total,
        `Held for survey "${survey.title}" — ${survey.targetResponses} responses`,
        undefined,
        manager,
        survey.businessId,
      );
    });

    return {
      ...survey,
      quote,
      audienceSize,
      shortfall: Math.max(0, survey.targetResponses - audienceSize),
    };
  }

  /** Close early. Refunds whatever was never delivered, in the same transaction. */
  async close(userId: number, surveyId: number) {
    const survey = await this.ownedSurvey(userId, surveyId);
    if (survey.status !== 'live') {
      throw new BadRequestException(`Only a live survey can be closed — this one is ${survey.status}.`);
    }

    await this.dataSource.transaction((manager) => this.settle(manager, survey, 'closed', userId));
    return survey;
  }

  /**
   * Expire every survey past its time limit. A survey closes when EITHER the
   * target is met or the time runs out (§3.3); without this the money for an
   * unfinished survey stays held forever.
   */
  async expireDue(now: Date = new Date()): Promise<number> {
    const due = await this.surveyRepository.find({
      where: { status: 'live', expiresAt: LessThanOrEqual(now) },
      relations: ['business'],
    });

    let expired = 0;
    for (const survey of due) {
      try {
        await this.dataSource.transaction((manager) =>
          this.settle(manager, survey, 'expired', survey.business?.userId),
        );
        expired += 1;
      } catch (error) {
        // One survey failing to settle must not strand the rest.
        this.logger.error(`Failed to expire survey ${survey.id}: ${(error as Error).message}`);
      }
    }
    return expired;
  }

  /**
   * The shared money path for closing and expiring.
   *
   * The refund is proportional to responses NEVER DELIVERED, which returns the
   * platform's cut on those alongside the respondent's fee — the platform must
   * not keep a share for work nobody did.
   */
  private async settle(
    manager: EntityManager,
    survey: Survey,
    status: 'closed' | 'expired',
    userId?: number,
  ) {
    const held = Number(survey.totalHeld ?? 0);
    const paid = Number(survey.totalPaid ?? 0);
    const price = Number(survey.pricePerResponse ?? 0);
    const target = survey.targetResponses || 0;

    const delivered = price > 0 ? Math.round(paid / price) : 0;
    const undelivered = Math.max(0, target - delivered);
    const refund = target > 0 ? toCents((held * undelivered) / target) : 0;

    if (refund > 0) {
      const business = await manager.findOne(Business, {
        where: { id: survey.businessId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!business) throw new NotFoundException('Business not found');

      business.walletBalance = toCents(Number(business.walletBalance ?? 0) + refund) as any;
      await manager.save(Business, business);

      await this.transactions.log(
        userId ?? business.userId,
        'SURVEY_ESCROW_REFUNDED',
        refund,
        `Refund from survey "${survey.title}" — ${undelivered} of ${target} responses unfilled`,
        undefined,
        manager,
        survey.businessId,
      );
    }

    survey.status = status;
    survey.closedAt = new Date();
    await manager.save(Survey, survey);
  }
}
