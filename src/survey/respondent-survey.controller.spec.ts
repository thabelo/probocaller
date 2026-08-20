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
      history: jest.fn().mockResolvedValue({ answered: 0, totalEarned: 0, responses: [] }),
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

/**
 * A respondent's own record of what they answered and earned. Scoped to the
 * caller by the token — the route takes no user id, so one respondent can
 * never ask for another's history.
 */
describe('RespondentSurveyController — my history', () => {
  let controller: RespondentSurveyController;
  let responses: any;

  beforeEach(async () => {
    responses = {
      available: jest.fn(),
      submit: jest.fn(),
      history: jest.fn().mockResolvedValue({ answered: 2, totalEarned: 6.5, responses: [] }),
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

  it('answers with the caller own history', async () => {
    const out = await controller.history({ user: { userId: 5 } } as any);
    expect(responses.history).toHaveBeenCalledWith(5);
    expect(out).toEqual({ answered: 2, totalEarned: 6.5, responses: [] });
  });

  it('takes the respondent from the token, not from the request', async () => {
    await controller.history({ user: { userId: 9 } } as any);
    expect(responses.history).toHaveBeenCalledWith(9);
    expect(responses.history).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });
});
