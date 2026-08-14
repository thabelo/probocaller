import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyService } from './survey.service';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyMatchingService } from './survey-matching.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { SurveyTemplate } from './survey-template.entity';
import { Business } from '../business/business.entity';

/**
 * Build-order step 2: creating a survey. DRAFT ONLY — no money moves here.
 *
 * The builder is an API first and two clients second (surveys-spec §3.4), so
 * everything a mobile or web builder needs must be decided here: what it costs,
 * who it targets, how long it runs. No client may re-derive any of it.
 */
describe('SurveyService — creating a draft', () => {
  let service: SurveyService;
  let surveyRepo: any;
  let questionRepo: any;
  let templateRepo: any;
  let businessRepo: any;
  let matching: any;

  const OWNED_BUSINESS = { id: 7, userId: 1, name: 'Acme' };

  const savedSurvey = () => surveyRepo.save.mock.calls[0][0];

  beforeEach(async () => {
    surveyRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => ({ id: 100, ...d })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    questionRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => d),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };
    templateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    matching = {
      assertKnownFields: jest.fn().mockResolvedValue(undefined),
      estimateAudience: jest.fn().mockResolvedValue(500),
    };
    businessRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === OWNED_BUSINESS.id && where.userId === OWNED_BUSINESS.userId
          ? OWNED_BUSINESS
          : null,
      ),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        { provide: SurveyPricingService, useValue: {} },
        { provide: SurveyMatchingService, useValue: matching },
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: getRepositoryToken(SurveyTemplate), useValue: templateRepo },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
      ],
    })
      .overrideProvider(SurveyPricingService)
      .useValue({
        pricePerResponse: jest.fn().mockResolvedValue(3),
        quote: jest.fn().mockResolvedValue({
          pricePerResponse: 3, targetResponses: 100,
          respondentTotal: 300, platformFee: 72, total: 372,
        }),
      })
      .compile();

    service = mod.get(SurveyService);
  });

  const input = (over: Record<string, unknown> = {}) => ({
    businessId: 7,
    title: 'How are we doing?',
    targetResponses: 100,
    durationDays: 30,
    questions: [
      { type: 'free_text' as const, prompt: 'What would you change?' },
      { type: 'yes_no' as const, prompt: 'Would you recommend us?' },
    ],
    ...over,
  });

  describe('ownership', () => {
    it('creates a draft for a business the caller owns', async () => {
      const result = await service.createDraft(1, input());
      expect(result.id).toBe(100);
      expect(savedSurvey().businessId).toBe(7);
    });

    it('refuses a business the caller does not own', async () => {
      await expect(service.createDraft(2, input())).rejects.toBeInstanceOf(NotFoundException);
      expect(surveyRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('what a draft is', () => {
    it('starts as a draft — creating a survey moves no money', async () => {
      await service.createDraft(1, input());
      expect(savedSurvey().status).toBe('draft');
      expect(savedSurvey().publishedAt).toBeNull();
    });

    /**
     * Price is FROZEN at publish, not at creation. Writing it now would mean a
     * draft left for a week quotes a rate the platform has since changed, and
     * escrow would be taken at a number nobody agreed to.
     */
    it('does not freeze a price onto an unpublished draft', async () => {
      await service.createDraft(1, input());
      expect(Number(savedSurvey().totalHeld)).toBe(0);
      expect(Number(savedSurvey().pricePerResponse)).toBe(0);
    });

    /** But the builder still has to show what it WOULD cost right now. */
    it('returns a live quote so the builder can show the price', async () => {
      const result = await service.createDraft(1, input());
      expect(result.quote).toEqual({
        pricePerResponse: 3, targetResponses: 100,
        respondentTotal: 300, platformFee: 72, total: 372,
      });
    });
  });

  describe('questions', () => {
    it('stores the questions in the order they were given', async () => {
      await service.createDraft(1, input());
      const saved = questionRepo.save.mock.calls.map(([q]: any[]) => q);
      expect(saved.map((q: any) => q.position)).toEqual([0, 1]);
      expect(saved.map((q: any) => q.type)).toEqual(['free_text', 'yes_no']);
    });

    it('leaves feeAtPublish unset until the survey is published', async () => {
      await service.createDraft(1, input());
      const [question] = questionRepo.save.mock.calls[0];
      expect(Number(question.feeAtPublish)).toBe(0);
    });

    it('refuses a survey with no questions', async () => {
      await expect(service.createDraft(1, input({ questions: [] }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a question type it cannot price', async () => {
      await expect(
        service.createDraft(1, input({ questions: [{ type: 'essay', prompt: 'Why?' }] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a choice question with no options', async () => {
      await expect(
        service.createDraft(1, input({ questions: [{ type: 'dropdown', prompt: 'Pick' }] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('from a template', () => {
    const TEMPLATE = {
      id: 3,
      key: 'insurance-nps',
      name: 'Insurance NPS',
      category: 'insurance',
      isActive: true,
      questionsJson: [
        { type: 'yes_no', prompt: 'Would you recommend us?' },
        { type: 'free_text', prompt: 'Why?' },
      ],
    };

    /**
     * A business builds from a COPY (§3.1). The questions are duplicated onto
     * the survey, so a later template edit cannot reach a survey already built.
     */
    it('copies the template questions onto the survey', async () => {
      templateRepo.findOne.mockResolvedValue(TEMPLATE);

      await service.createDraft(1, {
        businessId: 7,
        title: 'NPS Q3',
        targetResponses: 50,
        durationDays: 14,
        templateKey: 'insurance-nps',
      });

      const saved = questionRepo.save.mock.calls.map(([q]: any[]) => q);
      expect(saved.map((q: any) => q.prompt)).toEqual([
        'Would you recommend us?',
        'Why?',
      ]);
    });

    it('inherits the template category when the caller gives none', async () => {
      templateRepo.findOne.mockResolvedValue(TEMPLATE);
      await service.createDraft(1, {
        businessId: 7, title: 'NPS Q3', targetResponses: 50, durationDays: 14,
        templateKey: 'insurance-nps',
      });
      expect(savedSurvey().category).toBe('insurance');
    });

    it('reports an unknown template', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createDraft(1, {
          businessId: 7, title: 'x', targetResponses: 5, durationDays: 1,
          templateKey: 'nope',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /** Retired templates are withdrawn from the library, not merely hidden. */
    it('refuses a retired template', async () => {
      templateRepo.findOne.mockResolvedValue({ ...TEMPLATE, isActive: false });
      await expect(
        service.createDraft(1, {
          businessId: 7, title: 'x', targetResponses: 5, durationDays: 1,
          templateKey: 'insurance-nps',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('lifetime and target', () => {
    it('turns a duration in days into an expiry', async () => {
      const before = Date.now();
      await service.createDraft(1, input({ durationDays: 30 }));

      const expires = new Date(savedSurvey().expiresAt).getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(expires).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
      expect(expires).toBeLessThanOrEqual(Date.now() + thirtyDays + 1000);
    });

    /** Indefinite is a real option (§3.3): only the response target closes it. */
    it('accepts an indefinite lifetime', async () => {
      await service.createDraft(1, input({ durationDays: null }));
      expect(savedSurvey().expiresAt).toBeNull();
    });

    it('refuses a target of zero or a fraction', async () => {
      await expect(service.createDraft(1, input({ targetResponses: 0 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.createDraft(1, input({ targetResponses: 2.5 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a negative duration', async () => {
      await expect(service.createDraft(1, input({ durationDays: -1 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  /**
   * Category labels and reports; filters do the matching (§3.2). Industry
   * appears in both deliberately — an insurer may survey the public, or
   * specifically people working in insurance.
   */
  describe('targeting', () => {
    it('stores respondent filters separately from the reporting category', async () => {
      await service.createDraft(1, input({
        category: 'insurance',
        filters: { age_range: ['25_34', '35_44'], province: 'Gauteng', industry_sector: 'insurance' },
      }));

      expect(savedSurvey().category).toBe('insurance');
      expect(savedSurvey().filtersJson).toEqual({
        age_range: ['25_34', '35_44'], province: 'Gauteng', industry_sector: 'insurance',
      });
    });

    it('defaults to no filters — anyone with the app may answer', async () => {
      await service.createDraft(1, input());
      expect(savedSurvey().filtersJson).toEqual({});
    });

    /**
     * Filters are keyed by real profile fields. A typo'd key matches nobody, so
     * without this a business could pay to publish a survey nobody can answer.
     */
    it('refuses a filter on a profile field that does not exist', async () => {
      matching.assertKnownFields.mockRejectedValueOnce(
        new BadRequestException('Unknown profile field: provnce'),
      );
      await expect(
        service.createDraft(1, input({ filters: { provnce: 'Gauteng' } })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(surveyRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('SurveyService — reading and editing drafts', () => {
  let service: SurveyService;
  let surveyRepo: any;
  let questionRepo: any;
  let businessRepo: any;

  const DRAFT = { id: 100, businessId: 7, status: 'draft', title: 'Draft', business: { userId: 1 } };

  beforeEach(async () => {
    surveyRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => d),
      findOne: jest.fn().mockResolvedValue(DRAFT),
      find: jest.fn().mockResolvedValue([DRAFT]),
      delete: jest.fn(),
    };
    questionRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => d),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };
    businessRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === 7 && where.userId === 1 ? { id: 7, userId: 1 } : null,
      ),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        { provide: SurveyPricingService, useValue: {
          pricePerResponse: jest.fn().mockResolvedValue(3),
          quote: jest.fn().mockResolvedValue({ pricePerResponse: 3, targetResponses: 100, total: 300 }),
        } },
        { provide: SurveyMatchingService, useValue: {
          assertKnownFields: jest.fn().mockResolvedValue(undefined),
          estimateAudience: jest.fn().mockResolvedValue(500),
        } },
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: questionRepo },
        { provide: getRepositoryToken(SurveyTemplate), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
      ],
    }).compile();

    service = mod.get(SurveyService);
  });

  it('lists the surveys of a business the caller owns', async () => {
    const list = await service.list(1, 7);
    expect(list).toHaveLength(1);
    expect(surveyRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 7 } }),
    );
  });

  it('refuses to list a business the caller does not own', async () => {
    await expect(service.list(2, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to read another account's survey", async () => {
    surveyRepo.findOne.mockResolvedValue({ ...DRAFT, business: { userId: 99 } });
    await expect(service.get(1, 100)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports a survey that does not exist', async () => {
    surveyRepo.findOne.mockResolvedValue(null);
    await expect(service.get(1, 404)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('edits a draft', async () => {
    await service.update(1, 100, { title: 'Renamed' });
    expect(surveyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed' }));
  });

  /**
   * Editing a live survey changes what respondents agreed to answer and what
   * was priced and escrowed. The safe default (§3.3) is close and republish.
   */
  it('refuses to edit a survey that is already live', async () => {
    surveyRepo.findOne.mockResolvedValue({ ...DRAFT, status: 'live' });
    await expect(service.update(1, 100, { title: 'Renamed' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * A draft can be thrown away. It holds no money and has no responses, so
   * nothing is lost — and without this a mistyped survey is stuck in the
   * business's list forever.
   */
  describe('deleting a draft', () => {
    it('deletes the draft and its questions', async () => {
      await service.deleteDraft(1, 100);
      expect(questionRepo.delete).toHaveBeenCalledWith({ surveyId: 100 });
      expect(surveyRepo.delete).toHaveBeenCalledWith({ id: 100 });
    });

    /**
     * A live survey holds escrow and may already have answers someone was paid
     * for. Deleting it would destroy the record of money that moved.
     */
    it('refuses to delete a survey that is not a draft', async () => {
      surveyRepo.findOne.mockResolvedValue({ ...DRAFT, status: 'live' });
      await expect(service.deleteDraft(1, 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(surveyRepo.delete).not.toHaveBeenCalled();
    });

    it("refuses to delete another account's draft", async () => {
      surveyRepo.findOne.mockResolvedValue({ ...DRAFT, business: { userId: 99 } });
      await expect(service.deleteDraft(1, 100)).rejects.toBeInstanceOf(ForbiddenException);
      expect(surveyRepo.delete).not.toHaveBeenCalled();
    });
  });

  it('replaces the whole question set when questions are edited', async () => {
    await service.update(1, 100, {
      questions: [{ type: 'yes_no', prompt: 'Only question now' }],
    });
    expect(questionRepo.delete).toHaveBeenCalledWith({ surveyId: 100 });
    expect(questionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Only question now', position: 0 }),
    );
  });
});
