import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { Business } from '../business/business.entity';

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
    matching = { estimateAudience: jest.fn().mockResolvedValue(500) };
    transactions = { log: jest.fn().mockResolvedValue({}) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyPublishService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: SurveyPricingService, useValue: pricing },
        { provide: SurveyMatchingService, useValue: matching },
        { provide: TransactionService, useValue: transactions },
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
});
