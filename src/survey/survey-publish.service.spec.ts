import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyPricingService } from './survey-pricing.service';
import { PushService } from '../push/push.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * Build-order step 3 — the money-critical one.
 *
 * Publishing debits and HOLDS `price × target` plus the platform cut (§1.2).
 * Respondents are paid from that pot on completion; the unspent remainder is
 * refunded when the survey closes or expires, in the SAME transaction that
 * closes it. This is the only arrangement where a respondent who completes is
 * always paid and a business can never overspend.
 */
describe('SurveyPublishService', () => {
  let service: SurveyPublishService;
  let manager: any;
  let surveyRepo: any;
  let questionRepo: any;
  let pricing: any;
  let matching: any;
  let push: any;
  let userRepo: any;
  let transactions: any;

  const DRAFT = () => ({
    id: 100,
    businessId: 7,
    status: 'draft',
    title: 'How are we doing?',
    targetResponses: 100,
    filtersJson: {},
    pricePerResponse: '0',
    totalHeld: '0',
    totalPaid: '0',
    publishedAt: null,
    closedAt: null,
    expiresAt: null,
    business: { userId: 1 },
  });

  const QUESTIONS = [
    { id: 1, surveyId: 100, type: 'free_text', prompt: 'a', position: 0, feeAtPublish: '0' },
    { id: 2, surveyId: 100, type: 'yes_no', prompt: 'b', position: 1, feeAtPublish: '0' },
  ];

  /** What the wallet ended up at, from the Business row the code saved. */
  const savedBusiness = () =>
    manager.save.mock.calls.map(([, row]: any[]) => row).find((r: any) => 'walletBalance' in r);

  const savedSurvey = () =>
    manager.save.mock.calls.map(([, row]: any[]) => row).find((r: any) => 'totalHeld' in r);

  beforeEach(async () => {
    const business = { id: 7, userId: 1, companyName: 'Acme', walletBalance: '1000' };

    manager = {
      findOne: jest.fn(async (entity: any) => (entity === Business ? business : null)),
      find: jest.fn().mockResolvedValue(QUESTIONS),
      save: jest.fn(async (_e: any, row: any) => row),
    };

    surveyRepo = {
      findOne: jest.fn().mockResolvedValue(DRAFT()),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (r: any) => r),
    };
    questionRepo = { find: jest.fn().mockResolvedValue(QUESTIONS) };
    pricing = {
      // Per-type rate, used to freeze feeAtPublish onto each question.
      pricePerResponse: jest.fn(async ([type]: string[]) =>
        ({ free_text: 2.5, yes_no: 0.5 } as Record<string, number>)[type] ?? 1),
      quote: jest.fn().mockResolvedValue({
        pricePerResponse: 3, targetResponses: 100,
        respondentTotal: 300, platformFee: 72, total: 372,
      }),
    };
    matching = { estimateAudience: jest.fn().mockResolvedValue(500), audience: jest.fn().mockResolvedValue([]) };
    push = { sendToUser: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }) };
    userRepo = {
      find: jest.fn(async ({ where }: any) =>
        (where?.id?._value ?? []).map((id: number) => ({ id, notifications: [] })),
      ),
      save: jest.fn(async (u: any) => u),
    };
    transactions = { log: jest.fn().mockResolvedValue({}) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyPublishService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: SurveyPricingService, useValue: pricing },
        { provide: SurveyMatchingService, useValue: matching },
        { provide: PushService, useValue: push },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: TransactionService, useValue: transactions },
        // Results thresholds fall back to their floors when unset (5/10/10).
        { provide: SettingsReaderService, useValue: { getNumber: jest.fn(async () => NaN) } },
        {
          provide: DataSource,
          useValue: { transaction: (fn: any) => fn(manager) },
        },
      ],
    }).compile();

    service = mod.get(SurveyPublishService);
  });

  describe('publishing', () => {
    it('debits the wallet by the full quoted total, cut included', async () => {
      await service.publish(1, 100);
      expect(Number(savedBusiness().walletBalance)).toBe(1000 - 372);
    });

    it('goes live and stamps when it was published', async () => {
      await service.publish(1, 100);
      expect(savedSurvey().status).toBe('live');
      expect(savedSurvey().publishedAt).toBeInstanceOf(Date);
    });

    /**
     * The held amount is the FULL debit, not just the respondent pot. Refunds
     * are proportional to responses never delivered, so the platform's share of
     * an unanswered response comes back too — the platform must not keep a cut
     * for work nobody did.
     */
    it('records the whole debit as held', async () => {
      await service.publish(1, 100);
      expect(Number(savedSurvey().totalHeld)).toBe(372);
      expect(Number(savedSurvey().totalPaid)).toBe(0);
    });

    /** Price is frozen NOW, so a later rate change cannot rewrite what is owed. */
    it('freezes the price and every question fee at publish', async () => {
      await service.publish(1, 100);

      expect(Number(savedSurvey().pricePerResponse)).toBe(3);
      const savedQuestions = manager.save.mock.calls
        .map(([, row]: any[]) => row)
        .filter((r: any) => 'feeAtPublish' in r);
      expect(savedQuestions).toHaveLength(2);
      expect(savedQuestions.every((q: any) => Number(q.feeAtPublish) > 0)).toBe(true);
    });

    it('writes an audit row for the money leaving the wallet', async () => {
      await service.publish(1, 100);
      expect(transactions.log).toHaveBeenCalledWith(
        1, 'SURVEY_ESCROW_HELD', 372, expect.stringContaining('How are we doing?'),
        undefined, manager, 7,
      );
    });

    it('refuses a wallet that cannot cover the total', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme', walletBalance: '100' });
      await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(transactions.log).not.toHaveBeenCalled();
    });

    /**
     * Rejecting is not enough — nothing may move on the way out. The existing
     * case above only proves no ledger row was written, which would still pass
     * if the wallet were debited or the survey flipped live before the balance
     * check ran. These pin the order.
     */
    it('leaves the wallet untouched when it cannot cover the total', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme', walletBalance: '100' });
      await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(savedBusiness()).toBeUndefined();
    });

    it('leaves the survey a draft when it cannot cover the total', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme', walletBalance: '100' });
      await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(savedSurvey()).toBeUndefined();
    });

    /** The business has to be told the shortfall, not just refused. */
    it('names what it costs and what the wallet holds', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme', walletBalance: '100' });
      await expect(service.publish(1, 100)).rejects.toThrow(/372\.00[\s\S]*100\.00/);
    });

    /** Exactly enough is enough — the guard is `<`, not `<=`. */
    it('allows a wallet that covers the total exactly', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme', walletBalance: '372' });
      await expect(service.publish(1, 100)).resolves.toBeDefined();
      expect(Number(savedBusiness().walletBalance)).toBe(0);
    });

    it('refuses to publish twice', async () => {
      surveyRepo.findOne.mockResolvedValue({ ...DRAFT(), status: 'live' });
      await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to publish someone else's survey", async () => {
      surveyRepo.findOne.mockResolvedValue({ ...DRAFT(), business: { userId: 99 } });
      await expect(service.publish(1, 100)).rejects.toThrow();
    });

    it('refuses a survey with no questions', async () => {
      questionRepo.find.mockResolvedValue([]);
      await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * Screened at the builder AND again here. A question written before the
     * screen shipped is still sitting in a draft somewhere, and publish is the
     * last point before real people are asked it.
     */
    it('refuses to publish a survey with a question that asks for identifying details', async () => {
      questionRepo.find.mockResolvedValue([
        { id: 1, surveyId: 100, type: 'free_text', prompt: 'What is your ID number?', position: 0, feeAtPublish: '0' },
      ]);
      await expect(service.publish(1, 100)).rejects.toThrow(/anonymous/i);
      expect(transactions.log).not.toHaveBeenCalled();
    });

    /**
     * A narrow filter is allowed to publish — the business is warned and the
     * unfilled remainder refunds on expiry — but it must be TOLD, or it pays
     * for responses that were never reachable.
     */
    it('reports an audience smaller than the target instead of blocking', async () => {
      matching.estimateAudience.mockResolvedValue(20);

      const result = await service.publish(1, 100);

      expect(result.audienceSize).toBe(20);
      expect(result.shortfall).toBe(80);
      expect(savedSurvey().status).toBe('live');
    });

    it('reports no shortfall when the audience is big enough', async () => {
      const result = await service.publish(1, 100);
      expect(result.shortfall).toBe(0);
    });

    /**
     * Results are only ever shown for ten answers or more, so a survey aimed at
     * fewer than ten people could never report back — the business would pay,
     * people would answer, and the page would say "not enough answers" forever.
     * Selling that is worse than refusing it.
     */
    describe('a survey that could never report back', () => {
      it('refuses to publish to an audience smaller than the release threshold', async () => {
        matching.estimateAudience.mockResolvedValue(6);
        await expect(service.publish(1, 100)).rejects.toBeInstanceOf(BadRequestException);
      });

      it('says what to do about it rather than just refusing', async () => {
        matching.estimateAudience.mockResolvedValue(6);
        await expect(service.publish(1, 100)).rejects.toThrow(/widen|Audience & Leads/i);
      });

      it('takes no money for a survey it refuses', async () => {
        matching.estimateAudience.mockResolvedValue(6);
        await expect(service.publish(1, 100)).rejects.toThrow();
        expect(savedBusiness()).toBeUndefined();
        expect(transactions.log).not.toHaveBeenCalled();
      });

      it('refuses to publish for fewer responses than the release threshold', async () => {
        surveyRepo.findOne.mockResolvedValue({ ...DRAFT(), targetResponses: 5 });
        await expect(service.publish(1, 100)).rejects.toThrow(/10/);
      });

      /** Exactly ten is enough — the guard is `<`, not `<=`. */
      it('allows an audience of exactly the release threshold', async () => {
        matching.estimateAudience.mockResolvedValue(10);
        await expect(service.publish(1, 100)).resolves.toBeDefined();
      });
    });

    /** What it was sold against, so a survey that settles short is answerable. */
    it('records the audience it was published to', async () => {
      matching.estimateAudience.mockResolvedValue(20);
      await service.publish(1, 100);
      expect(savedSurvey().audienceAtPublish).toBe(20);
    });
  });

  describe('closing', () => {
    const LIVE = (over: Record<string, unknown> = {}) => ({
      ...DRAFT(),
      status: 'live',
      pricePerResponse: '3',
      totalHeld: '372',
      totalPaid: '0',
      publishedAt: new Date(),
      ...over,
    });

    it('refunds the whole hold when nobody answered', async () => {
      surveyRepo.findOne.mockResolvedValue(LIVE());
      await service.close(1, 100);

      expect(Number(savedBusiness().walletBalance)).toBe(1000 + 372);
      expect(savedSurvey().status).toBe('closed');
    });

    /**
     * Refund is proportional to responses NOT delivered, so an undelivered
     * response returns its platform cut as well as its fee.
     */
    it('refunds only the undelivered share', async () => {
      // 40 of 100 delivered: 40 × R3 = R120 paid, 60% of R372 = R223.20 back.
      surveyRepo.findOne.mockResolvedValue(LIVE({ totalPaid: '120' }));
      await service.close(1, 100);

      expect(Number(savedBusiness().walletBalance)).toBe(1000 + 223.2);
    });

    /** Nothing to refund means the wallet is never touched at all — no lock, no write. */
    it('refunds nothing when every response was delivered', async () => {
      surveyRepo.findOne.mockResolvedValue(LIVE({ totalPaid: '300' }));
      await service.close(1, 100);

      expect(savedBusiness()).toBeUndefined();
      expect(savedSurvey().status).toBe('closed');
    });

    it('writes an audit row for the refund', async () => {
      surveyRepo.findOne.mockResolvedValue(LIVE());
      await service.close(1, 100);
      expect(transactions.log).toHaveBeenCalledWith(
        1, 'SURVEY_ESCROW_REFUNDED', 372, expect.any(String), undefined, manager, 7,
      );
    });

    it('does not write a refund row when there is nothing to refund', async () => {
      surveyRepo.findOne.mockResolvedValue(LIVE({ totalPaid: '300' }));
      await service.close(1, 100);
      expect(transactions.log).not.toHaveBeenCalled();
    });

    /**
     * A survey that stops below the release threshold shows the business
     * NOTHING — reporting seven answers would mean identifying the seven. It
     * has to be free, or the privacy rule is a bait-and-switch the first time
     * it bites: money taken, answers given, nothing delivered.
     *
     * The respondents keep every cent they earned. The platform absorbs the
     * difference; that is the cost of a rule that protects people.
     */
    describe('a survey that stopped before it could ever report', () => {
      // 7 of 100 delivered at R3 = R21 paid. The proportional refund would be
      // 93% of R372 = R345.96 — this returns the whole R372 instead.
      const SHORT = () => LIVE({ totalPaid: '21' });

      it('refunds the whole hold when a survey settles below the release threshold', async () => {
        surveyRepo.findOne.mockResolvedValue(SHORT());
        await service.close(1, 100);
        expect(Number(savedBusiness().walletBalance)).toBe(1000 + 372);
      });

      it('says in the ledger why the whole hold came back', async () => {
        surveyRepo.findOne.mockResolvedValue(SHORT());
        await service.close(1, 100);
        expect(transactions.log).toHaveBeenCalledWith(
          1, 'SURVEY_ESCROW_REFUNDED', 372,
          expect.stringMatching(/too few to report/i), undefined, manager, 7,
        );
      });

      it('still refunds only the undelivered share when the survey did report', async () => {
        // 40 delivered — comfortably over the threshold, so the usual rule holds.
        surveyRepo.findOne.mockResolvedValue(LIVE({ totalPaid: '120' }));
        await service.close(1, 100);
        expect(Number(savedBusiness().walletBalance)).toBe(1000 + 223.2);
      });

      /** Exactly ten reported, so the usual proportional refund applies. */
      it('treats exactly the release threshold as having reported', async () => {
        surveyRepo.findOne.mockResolvedValue(LIVE({ totalPaid: '30' }));
        await service.close(1, 100);
        expect(Number(savedBusiness().walletBalance)).toBe(1000 + 334.8);
      });
    });

    /** Closing twice would refund the hold twice. */
    it('refuses to close a survey that is already closed', async () => {
      surveyRepo.findOne.mockResolvedValue(LIVE({ status: 'closed' }));
      await expect(service.close(1, 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to close a draft, which holds nothing', async () => {
      surveyRepo.findOne.mockResolvedValue(DRAFT());
      await expect(service.close(1, 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports a survey that does not exist', async () => {
      surveyRepo.findOne.mockResolvedValue(null);
      await expect(service.close(1, 404)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * A survey closes when EITHER the target is met or the time runs out (§3.3),
   * and expiry has to refund exactly like an early close — otherwise money
   * stays held forever on a survey nobody will ever answer again.
   */
  describe('expiring', () => {
    it('expires and refunds every survey past its time limit', async () => {
      surveyRepo.find.mockResolvedValue([
        { ...DRAFT(), id: 100, status: 'live', totalHeld: '372', totalPaid: '120', pricePerResponse: '3' },
      ]);

      const expired = await service.expireDue();

      expect(expired).toBe(1);
      expect(savedSurvey().status).toBe('expired');
      expect(Number(savedBusiness().walletBalance)).toBe(1000 + 223.2);
    });

    it('leaves indefinite surveys alone', async () => {
      surveyRepo.find.mockResolvedValue([]);
      await expect(service.expireDue()).resolves.toBe(0);
    });
  });

  /**
   * expireDue only returns money if something actually calls it. It was fully
   * tested and entirely unreachable — no scheduler, no route — so in
   * production the "or the time runs out" half of §3.3 never happened and the
   * hold on an expired survey stayed in escrow forever.
   *
   * Same shape as DataRetentionService's daily purge: an unref'd interval
   * started at module init, skipped under NODE_ENV=test so suites never spin a
   * timer, and cleared on shutdown.
   */
  describe('the expiry sweep is actually scheduled', () => {
    const asScheduled = async (run: () => void | Promise<void>) => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      jest.useFakeTimers();
      try {
        await run();
      } finally {
        service.onModuleDestroy();
        jest.useRealTimers();
        process.env.NODE_ENV = previous;
      }
    };

    it('sweeps for due surveys on a timer once started', async () => {
      const sweep = jest.spyOn(service, 'expireDue').mockResolvedValue(0);

      await asScheduled(() => {
        service.onModuleInit();
        expect(sweep).not.toHaveBeenCalled();

        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(sweep).toHaveBeenCalled();
      });
    });

    /** A failing sweep must not take the process down with it. */
    it('survives a sweep that throws', async () => {
      jest.spyOn(service, 'expireDue').mockRejectedValue(new Error('db down'));

      await asScheduled(async () => {
        service.onModuleInit();
        jest.advanceTimersByTime(60 * 60 * 1000);
        await Promise.resolve();
      });
    });

    /** Suites must never leave a live timer behind. */
    it('starts no timer under test', () => {
      const sweep = jest.spyOn(service, 'expireDue').mockResolvedValue(0);
      jest.useFakeTimers();
      try {
        service.onModuleInit();
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        expect(sweep).not.toHaveBeenCalled();
      } finally {
        service.onModuleDestroy();
        jest.useRealTimers();
      }
    });
  });


  /**
   * Publishing a survey has to reach the people it was aimed at.
   *
   * A respondent has no reason to open the app on the off-chance something has
   * appeared, so a survey nobody is told about is a survey nobody answers — the
   * business paid to reach an audience that never learns it exists. Everyone the
   * filters actually match gets an alert on their device.
   */
  describe('SurveyPublishService — alerting the audience', () => {
    const publishWith = async (audienceIds: number[]) => {
      matching.audience.mockResolvedValue(audienceIds);
      return service.publish(1, 1);
    };

    it('alerts every user the survey matches', async () => {
      await publishWith([11, 22, 33]);
      expect(push.sendToUser).toHaveBeenCalledTimes(3);
      expect(push.sendToUser.mock.calls.map((c: any[]) => c[0]).sort()).toEqual([11, 22, 33]);
    });

    it('names the survey and says it pays, so the alert is worth opening', async () => {
      await publishWith([11]);
      const payload = push.sendToUser.mock.calls[0][1];
      expect(`${payload.title} ${payload.body}`.toLowerCase()).toMatch(/survey/);
      expect(payload.body.length).toBeGreaterThan(10);
    });

    /** Tapping it must land on the survey, not a generic screen. */
    it('carries routing data so the tap opens the right thing', async () => {
      const published = await publishWith([11]);
      const payload = push.sendToUser.mock.calls[0][1];
      expect(payload.data?.kind).toBe('survey');
      // The survey that was actually published, not the id we asked to publish.
      expect(String(payload.data?.surveyId)).toBe(String(published.id));
    });

    it('matches on the survey filters, not on everyone', async () => {
      await publishWith([11]);
      expect(matching.audience).toHaveBeenCalledWith(expect.anything());
    });

    /**
     * The money has already moved by the time we get here. A push transport
     * outage must not roll that back or surface as a failed publish.
     */
    it('still publishes when alerting fails', async () => {
      push.sendToUser.mockRejectedValue(new Error('transport down'));
      await expect(publishWith([11, 22])).resolves.toMatchObject({ status: 'live' });
    });

    it('does nothing when the filters match nobody', async () => {
      await publishWith([]);
      expect(push.sendToUser).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    /**
     * Push has no live transport yet, so the notification row IS the delivery:
     * the app polls it and raises the tray alert. Writing only to push would
     * mean the feature quietly reaches nobody until FCM is wired up.
     */
    it('leaves a notification for every matched user, so the app can surface it', async () => {
      await publishWith([11, 22]);
      const saved = userRepo.save.mock.calls.map((c: any[]) => c[0]);
      expect(saved.map((u: any) => u.id).sort()).toEqual([11, 22]);
      saved.forEach((u: any) => {
        expect(u.notifications).toHaveLength(1);
        expect(u.notifications[0].message.toLowerCase()).toMatch(/survey/);
        expect(u.notifications[0].read).toBe(false);
      });
    });

    /**
     * The row has to say WHICH survey, not just that one exists.
     * Without it the app can only open the survey list, and a respondent who
     * already had a different survey open lands on that one instead — the
     * alert names one survey and delivers another.
     */
    it('records which survey the alert is about', async () => {
      const published = await publishWith([11]);
      const note = userRepo.save.mock.calls[0][0].notifications[0];
      expect(note.kind).toBe('survey');
      expect(String(note.target)).toBe(String(published.id));
    });

    it('keeps notifications the user already had', async () => {
      userRepo.find.mockResolvedValue([
        { id: 11, notifications: [{ id: 1, message: 'older', timestamp: new Date(), read: true }] },
      ]);
      await publishWith([11]);
      expect(userRepo.save.mock.calls[0][0].notifications).toHaveLength(2);
    });

    /** The survey is live and paid for; a failed write must not undo that. */
    it('still publishes when the notification write fails', async () => {
      userRepo.save.mockRejectedValue(new Error('db down'));
      await expect(publishWith([11])).resolves.toMatchObject({ status: 'live' });
    });
  });
});
