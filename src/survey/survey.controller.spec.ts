import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyMatchingService } from './survey-matching.service';
import { AppAccessGuard, REQUIRES_APP } from '../marketplace/app-access.guard';

/**
 * The business-facing builder (build-order step 2). Draft only — publishing is
 * step 3 and is not reachable from here.
 */
describe('SurveyController', () => {
  let controller: SurveyController;
  let surveys: any;
  let templates: any;
  let pricing: any;
  let publishing: any;
  let matching: any;

  const req = { user: { userId: 1 } };

  beforeEach(async () => {
    surveys = {
      createDraft: jest.fn().mockResolvedValue({ id: 100 }),
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 100 }),
      update: jest.fn().mockResolvedValue({ id: 100 }),
      deleteDraft: jest.fn().mockResolvedValue(undefined),
    };
    templates = { listActive: jest.fn().mockResolvedValue([]) };
    pricing = {
      quote: jest.fn().mockResolvedValue({ pricePerResponse: 3, targetResponses: 10, total: 30 }),
      quoteForBudget: jest.fn().mockResolvedValue({ pricePerResponse: 3, targetResponses: 26, total: 96.72 }),
    };

    publishing = {
      publish: jest.fn().mockResolvedValue({ id: 100, shortfall: 0 }),
      close: jest.fn().mockResolvedValue({ id: 100 }),
    };
    matching = { estimateAudience: jest.fn().mockResolvedValue(42) };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [SurveyController],
      providers: [
        { provide: SurveyService, useValue: surveys },
        { provide: SurveyTemplateService, useValue: templates },
        { provide: SurveyPricingService, useValue: pricing },
        { provide: SurveyPublishService, useValue: publishing },
        { provide: SurveyMatchingService, useValue: matching },
      ],
    })
      .overrideGuard(AppAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = mod.get(SurveyController);
  });

  /**
   * Publishing a survey is what the `survey-campaigns` app IS, so every route
   * here is gated on holding it — entitlement is never re-derived locally.
   */
  it('is gated on the survey-campaigns app', () => {
    expect(Reflect.getMetadata(REQUIRES_APP, SurveyController)).toBe('survey-campaigns');
    const guards = Reflect.getMetadata('__guards__', SurveyController) || [];
    expect(guards).toContain(AppAccessGuard);
  });

  /** Every route is scoped to the caller: the id comes from the token, never the body. */
  it('takes the acting user from the token, not the request body', async () => {
    await controller.create(req, { businessId: 7, title: 't', targetResponses: 5 } as any);
    expect(surveys.createDraft).toHaveBeenCalledWith(1, expect.objectContaining({ businessId: 7 }));
  });

  it('lists the surveys of a business', async () => {
    await controller.list(req, 7);
    expect(surveys.list).toHaveBeenCalledWith(1, 7);
  });

  it('reads one survey', async () => {
    await controller.get(req, 100);
    expect(surveys.get).toHaveBeenCalledWith(1, 100);
  });

  it('throws away a draft', async () => {
    await controller.remove(req, 100);
    expect(surveys.deleteDraft).toHaveBeenCalledWith(1, 100);
  });

  it('edits a draft', async () => {
    await controller.update(req, 100, { title: 'Renamed' });
    expect(surveys.update).toHaveBeenCalledWith(1, 100, { title: 'Renamed' });
  });

  /** The builder offers the library a business may build from — active only. */
  it('offers the active template library', async () => {
    await controller.templates();
    expect(templates.listActive).toHaveBeenCalled();
  });

  /**
   * The builder has to price a survey BEFORE it exists, or a business only
   * learns the cost after committing to build it.
   */
  it('quotes a set of questions without creating anything', async () => {
    await controller.quote({ questions: [{ type: 'yes_no', prompt: 'q' }], targetResponses: 10 } as any);
    expect(pricing.quote).toHaveBeenCalledWith(['yes_no'], 10, false);
    expect(surveys.createDraft).not.toHaveBeenCalled();
  });

  /** A budget asks the server how many responses it buys. */
  it('quotes from a budget when one is given', async () => {
    await controller.quote({ questions: [{ type: 'yes_no', prompt: 'q' }], budget: 100 } as any);
    expect(pricing.quoteForBudget).toHaveBeenCalledWith(['yes_no'], 100, false);
    expect(pricing.quote).not.toHaveBeenCalled();
  });

  /**
   * Publishing is what takes the money, so it is its OWN operation rather than
   * a status field a client could set (§1.2).
   */
  it('publishes a survey', async () => {
    await controller.publish(req, 100);
    expect(publishing.publish).toHaveBeenCalledWith(1, 100);
  });

  it('closes a survey early, which refunds what was never delivered', async () => {
    await controller.close(req, 100);
    expect(publishing.close).toHaveBeenCalledWith(1, 100);
  });

  /** The builder needs the reach BEFORE committing money to a narrow filter. */
  it('estimates how many people a filter can reach', async () => {
    await controller.audience({ filters: { province: 'Gauteng' } } as any);
    expect(matching.estimateAudience).toHaveBeenCalledWith({ province: 'Gauteng' });
  });
});
