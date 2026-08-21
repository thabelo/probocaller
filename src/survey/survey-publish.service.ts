import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
  OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { Business } from '../business/business.entity';
import { SurveyPricingService } from './survey-pricing.service';
import { In } from 'typeorm';
import { User } from '../user/user.entity';
import { PushService } from '../push/push.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { QuestionType, feeSettingKey } from './question-type';
import { assertPromptCollectsNoIdentity } from './prompt-screen';
import { SettingsReaderService } from '../config/settings-reader.service';
import { readResultThresholds } from './survey-results.thresholds';
import { bandAudience } from './survey-audience-band';

/** Round to cents, so a hold and its refunds still reconcile. */
const toCents = (amount: number) => Math.round(amount * 100) / 100;

/** How often to look for surveys whose time limit has passed. */
const EXPIRY_SWEEP_MS = 60 * 60 * 1000;

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
export class SurveyPublishService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurveyPublishService.name);

  private timer: NodeJS.Timeout | null = null;

  /**
   * Start the expiry sweep. Without it `expireDue` has no caller at all, and
   * the "or the time runs out" half of §3.3 never happens in production — the
   * hold on an expired survey would sit in escrow forever.
   *
   * Hourly rather than the daily cadence the retention purge uses: this one is
   * holding a business's money, so a day's lag is a day of someone else's cash
   * sitting in escrow after the survey stopped being answerable.
   */
  onModuleInit(): void {
    // Don't spin a timer in tests; unit tests call expireDue directly.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.expireDue().catch((error) =>
        this.logger.error('Scheduled survey expiry sweep failed', error as Error),
      );
    }, EXPIRY_SWEEP_MS);
    // Don't keep the process alive solely for this timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepository: Repository<SurveyQuestion>,
    private readonly pricing: SurveyPricingService,
    private readonly matching: SurveyMatchingService,
    private readonly push: PushService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly transactions: TransactionService,
    private readonly dataSource: DataSource,
    private readonly settingsReader: SettingsReaderService,
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
   * A narrow filter is still allowed, up to a point: the business is told how
   * many people it can actually reach and the unfilled remainder refunds on
   * expiry. But below the results release threshold it is now REFUSED, which
   * reverses what this comment used to say, and the reason is worth writing
   * down. Results are only ever shown for ten answers or more — a survey aimed
   * at six people could take the money, be answered honestly, and then never
   * report anything back, because reporting it would mean identifying the six.
   * Selling that is worse than refusing it, and the refusal names the way out:
   * widen the targeting, or use Audience & Leads, which is the product for
   * reaching named people and where users consented to exactly that.
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

    // Screened at the builder too, but a draft written before that screen
    // shipped is still a draft, and this is the last moment before real people
    // are asked the question.
    for (const question of questions) assertPromptCollectsNoIdentity(question.prompt);

    const quote = await this.pricing.quote(
      questions.map((q) => q.type as QuestionType),
      survey.targetResponses,
    );
    const audienceSize = await this.matching.estimateAudience(survey.filtersJson ?? {}, {
      businessId: survey.businessId,
    });

    // Both floors are checked BEFORE the transaction opens, so a refusal never
    // has to unwind a wallet debit.
    const { releaseThreshold } = await readResultThresholds(this.settingsReader);
    if (audienceSize < releaseThreshold) {
      throw new BadRequestException(
        `You are targeting ${audienceSize} ${audienceSize === 1 ? 'person' : 'people'}. Results are only ever shown for ${releaseThreshold} answers or more, so this survey could never report back. Widen your targeting, or use Audience & Leads if you need to reach named people.`,
      );
    }
    if (survey.targetResponses < releaseThreshold) {
      throw new BadRequestException(
        `You are asking for ${survey.targetResponses} responses. Results are only ever shown for ${releaseThreshold} answers or more, so this survey could never report back. Ask for at least ${releaseThreshold}.`,
      );
    }

    // Per-type rates, frozen onto each question so an admin retuning a rate
    // later cannot change what this survey owes.
    const feeByType = new Map<string, number>();
    await Promise.all(
      [...new Set(questions.map((q) => q.type))].map(async (type) =>
        feeByType.set(type, await this.pricing.pricePerResponse([type as QuestionType])),
      ),
    );

    await this.dataSource.transaction(async (manager) => {
      // Re-read the survey UNDER LOCK and re-confirm it is still a draft, before
      // any money moves. Two concurrent publish() calls both pass the unlocked
      // draft check above; the lock serialises them and the second sees the
      // survey is already 'live' and does nothing, so the wallet is debited
      // once. Survey is locked BEFORE Business — the same order settle() uses —
      // so the two paths cannot deadlock.
      const locked = await manager.findOne(Survey, {
        where: { id: surveyId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!locked || locked.status !== 'draft') {
        throw new BadRequestException(`This survey is already ${locked?.status ?? 'gone'}.`);
      }

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
      // What it was sold against. A survey that settles short is a different
      // conversation when the number it was quoted on is on the row.
      survey.audienceAtPublish = audienceSize;
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

    await this.alertAudience(survey);

    // Reported in a bucket, like the estimate endpoint. Banding that one buys
    // nothing if publishing the same filter then hands back the exact figure.
    // The exact count stays on the survey row, where it is an audit record
    // nobody outside this service ever reads. Rounding down overstates the
    // shortfall, which is the direction that warns rather than reassures.
    const band = bandAudience(audienceSize);

    return {
      ...survey,
      quote,
      ...band,
      shortfall: Math.max(0, survey.targetResponses - band.audienceSize),
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
   *
   * With ONE exception, and it is a whole-hold refund rather than a
   * proportional one. Results are never shown below the release threshold,
   * because reporting seven answers would mean identifying the seven. A survey
   * that stops there therefore delivers the business nothing at all, and
   * charging for nothing would make the privacy rule a bait-and-switch the
   * first time it bit. The respondents keep every cent they earned and the
   * platform absorbs the difference — that is the cost of the rule, and it is
   * bounded by one short survey's respondent pay.
   */
  private async settle(
    manager: EntityManager,
    survey: Survey,
    status: 'closed' | 'expired',
    userId?: number,
  ) {
    // Re-read the survey UNDER LOCK and re-check it is still live. Both close()
    // and expireDue() decide to settle from an UNLOCKED read outside this
    // transaction, so two concurrent settles for one live survey both get that
    // far. The lock here serialises them and the second sees status !== 'live'
    // and does nothing — so the escrow is refunded exactly once. Locking only
    // the Business row (below) serialises the two refunds but does NOT stop the
    // second from happening; the guard has to be on the survey's own status.
    // Lock order is survey-then-business everywhere, so publish and settle
    // cannot deadlock against each other.
    const locked = await manager.findOne(Survey, {
      where: { id: survey.id },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    if (!locked) throw new NotFoundException('Survey not found');
    if (locked.status !== 'live') return; // a racing close/expire already settled it

    const held = Number(locked.totalHeld ?? 0);
    const paid = Number(locked.totalPaid ?? 0);
    const price = Number(locked.pricePerResponse ?? 0);
    const target = locked.targetResponses || 0;

    const delivered = price > 0 ? Math.round(paid / price) : 0;
    const undelivered = Math.max(0, target - delivered);

    const { releaseThreshold } = await readResultThresholds(this.settingsReader);
    const neverReported = delivered < releaseThreshold;

    const refund = neverReported
      ? held
      : target > 0
        ? toCents((held * undelivered) / target)
        : 0;

    const reason = neverReported
      ? `Refund from survey "${locked.title}" — ${delivered} ${delivered === 1 ? 'answer' : 'answers'}, too few to report on without identifying someone`
      : `Refund from survey "${locked.title}" — ${undelivered} of ${target} responses unfilled`;

    if (refund > 0) {
      const business = await manager.findOne(Business, {
        where: { id: locked.businessId },
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
        reason,
        undefined,
        manager,
        locked.businessId,
      );
    }

    locked.status = status;
    locked.closedAt = new Date();
    await manager.save(Survey, locked);
    // Reflect the settled state onto the caller's object, which close() returns.
    survey.status = status;
    survey.closedAt = locked.closedAt;
  }

  /**
   * Tell the people it was aimed at that it exists.
   *
   * A respondent has no reason to open the app on the off-chance something new
   * has appeared, so a survey nobody is alerted to is one nobody answers — the
   * business would have paid to reach an audience that never learns of it.
   *
   * Deliberately after the transaction and deliberately swallowing failures:
   * the money has already moved and the survey is already live, so a push
   * transport outage must not roll that back or surface as a failed publish.
   * The worst case is a live survey that people find by opening Surveys.
   */
  private async alertAudience(survey: Survey): Promise<void> {
    try {
      const audience = await this.matching.audience(survey.filtersJson ?? {}, {
        businessId: survey.businessId,
      });
      const pays = Number(survey.pricePerResponse ?? 0);
      const reward = pays > 0 ? ` — answer it and earn ${pays.toFixed(2)} credits.` : '.';
      // Push carries its own "New survey for you" title, but the notification
      // row is one line in a tray with no title beside it. "How are we doing?
      // — earn 3.00 credits" gives the reader nothing to tell them what it is,
      // so this one says so on its own.
      const body = `${survey.title}${reward}`;
      const message = `New survey: ${survey.title}${reward}`;

      await Promise.all(
        audience.map((userId) =>
          this.push
            .sendToUser(userId, {
              title: 'New survey for you',
              body,
              // Routing, so tapping the alert opens THIS survey rather than a
              // list the user then has to search.
              data: { kind: 'survey', surveyId: String(survey.id) },
            })
            .catch(() => undefined),
        ),
      );

      // The notification row is what actually reaches a handset today: push has
      // no live transport yet, and the app polls this list to raise its tray
      // alert. Writing only to push would leave the feature reaching nobody.
      const recipients = await this.userRepository.find({ where: { id: In(audience) } });
      await Promise.all(
        recipients.map((user) => {
          const notifications = user.notifications || [];
          notifications.push({
            id: Date.now(),
            message,
            timestamp: new Date(),
            read: false,
            // Which survey, so a tap opens THIS one. Without it the app can
            // only reach the list, and a respondent who already had another
            // survey open would land on that one — the alert naming one
            // survey and delivering another.
            kind: 'survey',
            target: String(survey.id),
          });
          user.notifications = notifications;
          return this.userRepository.save(user).catch(() => undefined);
        }),
      );
    } catch {
      /* already live and paid for — never fail the publish over an alert */
    }
  }

}
