import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { RespondentSurveyController } from './respondent-survey.controller';
import { SurveyResponseService } from './survey-response.service';
import { AppAccessGuard, REQUIRES_APP } from '../marketplace/app-access.guard';

/**
 * The respondent half — answering and earning (build-order step 4).
 *
 * Gated on the `surveys` app, NOT `survey-campaigns`: they are two catalogue
 * entries for one product with different audiences, and installing `surveys`
 * is the consent to be matched (§2.2).
 */
describe('RespondentSurveyController', () => {
  let controller: RespondentSurveyController;
  let responses: any;

  const req = { user: { userId: 5 } };

  beforeEach(async () => {
    responses = {
      available: jest.fn().mockResolvedValue([]),
      submit: jest.fn().mockResolvedValue({ responseId: 55, earned: 4 }),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [RespondentSurveyController],
      providers: [{ provide: SurveyResponseService, useValue: responses }],
    })
      .overrideGuard(AppAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = mod.get(RespondentSurveyController);
  });

  it('is gated on the surveys app, not survey-campaigns', () => {
    expect(Reflect.getMetadata(REQUIRES_APP, RespondentSurveyController)).toBe('surveys');
    const guards = Reflect.getMetadata('__guards__', RespondentSurveyController) || [];
    expect(guards).toContain(AppAccessGuard);
  });

  it('lists what this person can answer', async () => {
    await controller.available(req);
    expect(responses.available).toHaveBeenCalledWith(5);
  });

  /** The acting user comes from the token — never from the body. */
  it('submits answers as the authenticated respondent', async () => {
    await controller.submit(req, 100, { answers: [{ questionId: 1, valueText: 'x' }] } as any);
    expect(responses.submit).toHaveBeenCalledWith(5, 100, [{ questionId: 1, valueText: 'x' }]);
  });

  it('tells the respondent what they earned', async () => {
    const result = await controller.submit(req, 100, { answers: [] } as any);
    expect(result).toEqual({ responseId: 55, earned: 4 });
  });

  /**
   * A business must never reach a respondent's identity through this API
   * (§2.1), so there is no route here that reads anyone else's responses.
   */
  it('exposes no route that reads other people’s responses', () => {
    const methods = Object.getOwnPropertyNames(RespondentSurveyController.prototype);
    expect(methods.some((m) => /respondents|whoAnswered|users/i.test(m))).toBe(false);
  });
});
