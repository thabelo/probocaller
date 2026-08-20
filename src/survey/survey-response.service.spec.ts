import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyResponseService } from './survey-response.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { SurveyResponse } from './survey-response.entity';
import { SurveyAnswer } from './survey-answer.entity';
import { User } from '../user/user.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { Business } from '../business/business.entity';

/**
 * Build-order step 4 — the respondent side.
 *
 * Paid on COMPLETION (§1.3): someone who answers six of ten questions and
 * abandons earns nothing and costs the business nothing. Payment comes out of
 * the pot the survey already escrowed, so a respondent who finishes is always
 * paid.
 *
 * Privacy (§2.1): the response stores userId for payment and de-duplication,
 * but nothing here may hand it to a business.
 */
describe('SurveyResponseService', () => {
  let service: SurveyResponseService;
  let manager: any;
  let surveyRepo: any;
  let questionRepo: any;
  let responseRepo: any;
  let matching: any;
  let transactions: any;

  const QUESTIONS = [
    { id: 1, surveyId: 100, type: 'free_text', prompt: 'Why?', position: 0, required: true, feeAtPublish: '2.50' },
    { id: 2, surveyId: 100, type: 'multi_select', prompt: 'Which?', position: 1, required: true, feeAtPublish: '1.50', optionsJson: ['a', 'b', 'c'] },
  ];

  const LIVE = (over: Record<string, unknown> = {}) => ({
    id: 100,
    businessId: 7,
    // Owned by user 9 — someone OTHER than the respondent in these tests.
    business: { id: 7, userId: 9 },
    title: 'How are we doing?',
    status: 'live',
    filtersJson: {},
    targetResponses: 100,
    pricePerResponse: '4.00',
    totalHeld: '496',
    totalPaid: '0',
    expiresAt: null,
    ...over,
  });

  const savedUser = () =>
    manager.save.mock.calls.map(([, row]: any[]) => row).find((r: any) => 'walletBalance' in r);
  const savedSurvey = () =>
    manager.save.mock.calls.map(([, row]: any[]) => row).find((r: any) => 'totalPaid' in r);
  const savedResponse = () =>
    manager.save.mock.calls.map(([, row]: any[]) => row).find((r: any) => 'submittedAt' in r);

  beforeEach(async () => {
    const user = { id: 5, walletBalance: '10' };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === User) return user;
        if (entity === Survey) return LIVE();
        if (entity === SurveyResponse) return { id: 55, surveyId: 100, userId: 5, submittedAt: null };
        return null;
      }),
      find: jest.fn().mockResolvedValue(QUESTIONS),
      save: jest.fn(async (_e: any, row: any) => row),
      create: jest.fn((_e: any, row: any) => row),
    };

    surveyRepo = {
      find: jest.fn().mockResolvedValue([LIVE()]),
      findOne: jest.fn().mockResolvedValue(LIVE()),
    };
    questionRepo = { find: jest.fn().mockResolvedValue(QUESTIONS) };
    responseRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => ({ id: 55, ...d })),
    };
    matching = { audience: jest.fn().mockResolvedValue([5]) };
    transactions = { log: jest.fn().mockResolvedValue({}) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyResponseService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: getRepositoryToken(SurveyResponse), useValue: responseRepo },
        { provide: getRepositoryToken(SurveyAnswer), useValue: { find: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(UserProfile), useValue: { findOne: jest.fn() } },
        { provide: SurveyMatchingService, useValue: matching },
        { provide: TransactionService, useValue: transactions },
        { provide: DataSource, useValue: { transaction: (fn: any) => fn(manager) } },
      ],
    }).compile();

    service = mod.get(SurveyResponseService);
  });

  describe('what a respondent is offered', () => {
    it('offers live surveys they match', async () => {
      const available = await service.available(5);
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(100);
    });

    /**
     * A respondent must see what a survey pays and roughly how long it takes
     * BEFORE starting — App Detail already promises exactly that.
     */
    it('says what it pays and how many questions it asks, before starting', async () => {
      const [survey] = await service.available(5);
      expect(Number(survey.pays)).toBe(4);
      expect(survey.questionCount).toBe(2);
    });

    it('does not offer a survey whose filters exclude them', async () => {
      matching.audience.mockResolvedValue([99]);
      await expect(service.available(5)).resolves.toEqual([]);
    });

    /** One response per person (§4.2) — an answered survey is not offered again. */
    it('does not offer a survey they already answered', async () => {
      responseRepo.find.mockResolvedValue([{ surveyId: 100, userId: 5 }]);
      await expect(service.available(5)).resolves.toEqual([]);
    });

    it('only ever offers live surveys', async () => {
      await service.available(5);
      expect(surveyRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'live' }) }),
      );
    });
  });

  /**
   * A business must not answer its own survey.
   *
   * It is not profitable — the owner pays the platform's cut to move money to
   * themselves — but it lets a business quietly inflate its own response count
   * and pollute the results it is about to act on. Worse, the response is
   * anonymous, so nothing downstream can tell it apart from a real one.
   */
  describe('a business cannot answer its own survey', () => {
    const OWN = (over: Record<string, unknown> = {}) =>
      LIVE({ business: { id: 7, userId: 5 }, ...over });

    it('is not offered to the person who owns the business', async () => {
      surveyRepo.find.mockResolvedValue([OWN()]);
      await expect(service.available(5)).resolves.toEqual([]);
    });

    it('is still offered to everyone else', async () => {
      surveyRepo.find.mockResolvedValue([OWN({ business: { id: 7, userId: 9 } })]);
      await expect(service.available(5)).resolves.toHaveLength(1);
    });

    it('refuses a submission from the owner, and pays nobody', async () => {
      manager.findOne.mockImplementation(async (entity: any) => {
        if (entity === User) return { id: 5, walletBalance: '10' };
        if (entity === Survey) return OWN();
        // The locked survey row carries no join, so ownership is read from the
        // business itself — owned here by the same person submitting.
        if (entity === Business) return { id: 7, userId: 5 };
        return null;
      });
      surveyRepo.findOne.mockResolvedValue(OWN());

      await expect(
        service.submit(5, 100, [
          { questionId: 1, valueText: 'x' },
          { questionId: 2, valueJson: ['a'] },
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transactions.log).not.toHaveBeenCalled();
    });
  });

  describe('answering', () => {
    const answers = () => [
      { questionId: 1, valueText: 'The claims process' },
      { questionId: 2, valueJson: ['a', 'c'] },
    ];

    it('pays the respondent the survey price on submission', async () => {
      await service.submit(5, 100, answers());
      expect(Number(savedUser().walletBalance)).toBe(10 + 4);
    });

    it('draws the payment from the pot the survey already holds', async () => {
      await service.submit(5, 100, answers());
      expect(Number(savedSurvey().totalPaid)).toBe(4);
    });

    it('stamps the response as submitted and records what was paid', async () => {
      await service.submit(5, 100, answers());
      expect(savedResponse().submittedAt).toBeInstanceOf(Date);
      expect(Number(savedResponse().amountPaid)).toBe(4);
    });

    it('writes an audit row naming the survey', async () => {
      await service.submit(5, 100, answers());
      expect(transactions.log).toHaveBeenCalledWith(
        5, 'SURVEY_EARNING', 4, expect.stringContaining('How are we doing?'), undefined, manager,
      );
    });

    /**
     * Partial answers earn nothing and cost nothing (§1.3) — this is what stops
     * paying for fragments and removes the incentive to abandon after the
     * best-paying question.
     */
    it('refuses a submission that skips a required question', async () => {
      await expect(
        service.submit(5, 100, [{ questionId: 1, valueText: 'only one' }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactions.log).not.toHaveBeenCalled();
    });

    it('refuses a blank answer to a required question', async () => {
      await expect(
        service.submit(5, 100, [
          { questionId: 1, valueText: '   ' },
          { questionId: 2, valueJson: ['a'] },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an answer to a question from another survey', async () => {
      await expect(
        service.submit(5, 100, [...answers(), { questionId: 999, valueText: 'x' }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /** Multi-select answers arrive as a list; single-value types must not. */
    it('refuses a list of answers to a single-answer question', async () => {
      await expect(
        service.submit(5, 100, [
          { questionId: 1, valueJson: ['a', 'b'] },
          { questionId: 2, valueJson: ['a'] },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a chosen option the question never offered', async () => {
      await expect(
        service.submit(5, 100, [
          { questionId: 1, valueText: 'ok' },
          { questionId: 2, valueJson: ['a', 'z'] },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to answer a survey that is not live', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === Survey ? LIVE({ status: 'closed' }) : { id: 5, walletBalance: '10' });
      await expect(service.submit(5, 100, answers())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses someone the survey does not target', async () => {
      matching.audience.mockResolvedValue([99]);
      await expect(service.submit(5, 100, answers())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a second response from the same person', async () => {
      responseRepo.findOne.mockResolvedValue({ id: 55, submittedAt: new Date() });
      await expect(service.submit(5, 100, answers())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports a survey that does not exist', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === Survey ? null : { id: 5, walletBalance: '10' });
      await expect(service.submit(5, 404, answers())).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * The pot is finite. Once the target is met the survey must stop taking
     * responses, or someone completes a survey there is no money left to pay
     * for — the exact failure escrow exists to prevent.
     */
    it('refuses once the survey has already bought every response', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === Survey
          ? LIVE({ targetResponses: 1, totalPaid: '4.00' })
          : { id: 5, walletBalance: '10' });

      await expect(service.submit(5, 100, answers())).rejects.toBeInstanceOf(BadRequestException);
      expect(transactions.log).not.toHaveBeenCalled();
    });

    /**
     * A survey closes when EITHER the target is met or the time runs out
     * (§3.3). Refusing further responses is not the same as closing: left
     * `live`, a full survey keeps being offered to respondents who are then
     * turned away at submit time, and the settle that returns the platform's
     * cut on any undelivered remainder never runs.
     */
    it('closes the survey when the last response it paid for arrives', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === Survey
          ? LIVE({ targetResponses: 2, totalPaid: '4.00' })
          : { id: 5, walletBalance: '10' });

      await service.submit(5, 100, answers());

      expect(savedSurvey().status).toBe('closed');
      expect(savedSurvey().closedAt).toBeInstanceOf(Date);
    });

    /** Below the target it stays open — closing early would strand the pot. */
    it('leaves the survey live while responses are still wanted', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === Survey
          ? LIVE({ targetResponses: 5, totalPaid: '4.00' })
          : { id: 5, walletBalance: '10' });

      await service.submit(5, 100, answers());

      expect(savedSurvey().status).toBe('live');
    });
  });
});

/**
 * "What have I answered, and what did it pay me?"
 *
 * A respondent needs a record of their own work: the app tells them a survey
 * pays before they start, so it owes them a ledger afterwards. Everything
 * needed is already on SurveyResponse (amountPaid, submittedAt) — this is a
 * read, and it never touches another respondent's rows.
 */
describe('SurveyResponseService — my history', () => {
  let service: SurveyResponseService;
  let responseRepo: any;
  let surveyRepo: any;

  const ROW = (over: Record<string, unknown> = {}) => ({
    id: 1, surveyId: 100, userId: 5,
    startedAt: new Date('2026-08-01T10:00:00Z'),
    submittedAt: new Date('2026-08-01T10:04:00Z'),
    amountPaid: '4.00',
    ...over,
  });

  beforeEach(async () => {
    responseRepo = { find: jest.fn().mockResolvedValue([]) };
    surveyRepo = { find: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyResponseService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SurveyResponse), useValue: responseRepo },
        { provide: getRepositoryToken(SurveyAnswer), useValue: { find: jest.fn() } },
        { provide: SurveyMatchingService, useValue: { audience: jest.fn() } },
        { provide: TransactionService, useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(SurveyResponseService);
  });

  it('is empty for someone who has answered nothing', async () => {
    const out = await service.history(5);
    expect(out.answered).toBe(0);
    expect(out.totalEarned).toBe(0);
    expect(out.responses).toEqual([]);
  });

  it('reports what each answered survey paid, and when', async () => {
    responseRepo.find.mockResolvedValue([ROW()]);
    surveyRepo.find.mockResolvedValue([
      { id: 100, title: 'How are we doing?', category: 'telecoms' },
    ]);
    const out = await service.history(5);
    expect(out.responses).toHaveLength(1);
    expect(out.responses[0]).toEqual(
      expect.objectContaining({ surveyId: 100, title: 'How are we doing?', category: 'telecoms', amountPaid: 4 }),
    );
  });

  it('totals what the respondent has earned', async () => {
    responseRepo.find.mockResolvedValue([
      ROW({ id: 1, surveyId: 100, amountPaid: '4.00' }),
      ROW({ id: 2, surveyId: 101, amountPaid: '2.50' }),
    ]);
    surveyRepo.find.mockResolvedValue([
      { id: 100, title: 'A', category: null },
      { id: 101, title: 'B', category: null },
    ]);
    const out = await service.history(5);
    expect(out.answered).toBe(2);
    expect(out.totalEarned).toBeCloseTo(6.5, 4);
  });

  /** A half-finished survey earns nothing, so it is not a thing they "did". */
  it('leaves out responses that were never submitted', async () => {
    await service.history(5);
    const where = responseRepo.find.mock.calls[0][0].where;
    expect(where.userId).toBe(5);
    expect(where.submittedAt).toBeDefined();
  });

  it('asks only for this respondent rows', async () => {
    await service.history(5);
    expect(responseRepo.find.mock.calls[0][0].where.userId).toBe(5);
  });

  it('puts the most recent first', async () => {
    await service.history(5);
    expect(responseRepo.find.mock.calls[0][0].order).toEqual({ submittedAt: 'DESC' });
  });

  /** A survey deleted since answering must not blank the row's money. */
  it('still reports the payment when the survey is gone', async () => {
    responseRepo.find.mockResolvedValue([ROW()]);
    surveyRepo.find.mockResolvedValue([]);
    const out = await service.history(5);
    expect(out.responses[0].amountPaid).toBe(4);
    expect(out.totalEarned).toBeCloseTo(4, 4);
  });
});
