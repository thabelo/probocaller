import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SurveyPricingService } from './survey-pricing.service';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * Price is set by the work asked of the respondent (surveys-spec §1.1): the
 * price per response is the sum of the questions' type rates, and the total
 * escrowed at publish is that price × the target number of responses (§1.2).
 *
 * Rates come from the settings table through SettingsReaderService with no
 * hardcoded fallback, matching every other rate on the platform — a missing
 * rate must fail loudly rather than quietly quote a stale number, because this
 * figure is what a business's wallet is debited.
 */
describe('SurveyPricingService', () => {
  let service: SurveyPricingService;
  let getNumber: jest.Mock;

  const RATES: Record<string, number> = {
    SURVEY_FEE_FREE_TEXT: 2.5,
    SURVEY_FEE_YES_NO: 0.5,
    SURVEY_FEE_MULTIPLE_CHOICE: 1,
    SURVEY_FEE_MULTI_SELECT: 1.5,
    SURVEY_FEE_DROPDOWN: 0.75,
    SURVEY_FEE_PHONE_NUMBER: 5,
    PLATFORM_CUT_RATE: 0.24,
  };

  beforeEach(async () => {
    getNumber = jest.fn(async (key: string) => {
      if (!(key in RATES)) throw new Error(`Missing or invalid setting: ${key}`);
      return RATES[key];
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyPricingService,
        { provide: SettingsReaderService, useValue: { getNumber } },
      ],
    }).compile();

    service = mod.get(SurveyPricingService);
  });

  it('prices one response as the sum of its question type rates', async () => {
    await expect(
      service.pricePerResponse(['free_text', 'yes_no', 'dropdown']),
    ).resolves.toBe(3.75);
  });

  it('charges per question, so repeated types add up', async () => {
    await expect(
      service.pricePerResponse(['yes_no', 'yes_no', 'yes_no', 'yes_no']),
    ).resolves.toBe(2);
  });

  it('reads each distinct rate once however many questions use it', async () => {
    await service.pricePerResponse(['yes_no', 'yes_no', 'free_text']);
    expect(getNumber).toHaveBeenCalledTimes(2);
  });

  /**
   * A ten-question free-text survey must cost more than ten yes/no questions —
   * the whole reason price is per type rather than per question.
   */
  it('prices effort: free text beats yes/no at equal length', async () => {
    const freeText = await service.pricePerResponse(Array(10).fill('free_text'));
    const yesNo = await service.pricePerResponse(Array(10).fill('yes_no'));
    expect(freeText).toBeGreaterThan(yesNo);
  });

  it('rejects a survey with no questions rather than quoting zero', async () => {
    await expect(service.pricePerResponse([])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown question type', async () => {
    await expect(service.pricePerResponse(['essay' as any])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getNumber).not.toHaveBeenCalled();
  });

  /** A missing rate is real misconfiguration; never fall back to a guess. */
  it('propagates a missing rate instead of pricing without it', async () => {
    getNumber.mockRejectedValueOnce(new Error('Missing or invalid setting: SURVEY_FEE_YES_NO'));
    await expect(service.pricePerResponse(['yes_no'])).rejects.toThrow('Missing or invalid setting');
  });

  /**
   * What the business's wallet is actually debited and held at publish (§1.2).
   *
   * The platform cut is added ON TOP: the respondent earns the full question
   * rates, and the business pays those plus the platform's share. Taking it out
   * of the respondent's fee instead would quietly pay someone less than the
   * rate the app showed them before they started.
   */
  it('quotes the escrow total as the respondent pot plus the platform cut', async () => {
    await expect(service.quote(['free_text', 'yes_no'], 100)).resolves.toEqual({
      pricePerResponse: 3,     // what one respondent earns — untouched by the cut
      targetResponses: 100,
      respondentTotal: 300,    // the pot respondents are paid from
      platformFee: 72,         // 24% on top
      total: 372,              // what is debited and held
    });
  });

  it('leaves the respondent fee alone whatever the cut is', async () => {
    getNumber.mockImplementation(async (key: string) =>
      key === 'PLATFORM_CUT_RATE' ? 0.5 : RATES[key]);

    const quote = await service.quote(['free_text'], 10);

    expect(quote.pricePerResponse).toBe(2.5);   // unchanged
    expect(quote.respondentTotal).toBe(25);
    expect(quote.platformFee).toBe(12.5);
    expect(quote.total).toBe(37.5);
  });

  it('reads the platform cut live rather than hardcoding 24%', async () => {
    await service.quote(['yes_no'], 1);
    expect(getNumber).toHaveBeenCalledWith('PLATFORM_CUT_RATE');
  });

  /** A zero cut is a legitimate setting, not a missing one. */
  it('holds exactly the respondent pot when the cut is zero', async () => {
    getNumber.mockImplementation(async (key: string) =>
      key === 'PLATFORM_CUT_RATE' ? 0 : RATES[key]);

    await expect(service.quote(['yes_no'], 10)).resolves.toMatchObject({
      platformFee: 0, total: 5,
    });
  });

  /**
   * A business thinks in money, not in response counts: "I have R500 to spend
   * on this" is the real question. How many responses that buys depends on the
   * question types AND the platform cut, so only the server can answer it —
   * a client dividing budget by a fee it guessed would promise responses the
   * wallet cannot cover.
   */
  describe('buying responses with a budget', () => {
    it('says how many responses a budget buys, cut included', async () => {
      // free text 2.50 + yes/no 0.50 = 3.00 a response, +24% = 3.72 all in.
      // R100 buys 26 of those (96.72), not 33.
      await expect(service.quoteForBudget(['free_text', 'yes_no'], 100)).resolves.toMatchObject({
        pricePerResponse: 3,
        targetResponses: 26,
      });
    });

    it('never promises more responses than the budget covers', async () => {
      const quote = await service.quoteForBudget(['free_text', 'yes_no'], 100);
      expect(quote.total).toBeLessThanOrEqual(100);
    });

    it('rounds down — a part-response is not a response', async () => {
      await expect(service.quoteForBudget(['yes_no'], 1.9)).resolves.toMatchObject({
        targetResponses: 3,   // 0.62 each all in
      });
    });

    /** Below the price of one response there is nothing to buy. */
    it('refuses a budget that cannot buy a single response', async () => {
      await expect(service.quoteForBudget(['free_text'], 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a budget of zero or less', async () => {
      await expect(service.quoteForBudget(['yes_no'], 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.quoteForBudget(['yes_no'], -10)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('rejects a target of zero or less', async () => {
    await expect(service.quote(['yes_no'], 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.quote(['yes_no'], -5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a fractional target', async () => {
    await expect(service.quote(['yes_no'], 2.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Money must not carry binary-float dust: 0.1 + 0.2 pricing repeated across a
   * large target is the classic way an escrow hold and its refunds stop
   * reconciling.
   */
  it('rounds money to cents rather than leaking float dust', async () => {
    getNumber.mockImplementation(async (key: string) => {
      if (key === 'PLATFORM_CUT_RATE') return 0;
      return key === 'SURVEY_FEE_YES_NO' ? 0.1 : 0.2;
    });

    const { pricePerResponse, total } = await service.quote(['yes_no', 'dropdown'], 3);

    expect(pricePerResponse).toBe(0.3);
    expect(total).toBe(0.9);
  });
});

/**
 * Collecting respondents' phone numbers.
 *
 * A business opts in per survey, and pays a per-response fee on top of the
 * question rates for it. Priced separately from the data-broking one-off
 * (PHONE_NUMBER_CREDIT_COST) because the two markets are not billed the same
 * — this fee buys a number in the narrow context of one survey.
 */
describe('SurveyPricingService — collecting phone numbers', () => {
  let service: SurveyPricingService;
  let getNumber: jest.Mock;

  const RATES: Record<string, number> = {
    SURVEY_FEE_FREE_TEXT: 2.5,
    SURVEY_FEE_YES_NO: 0.5,
    SURVEY_FEE_PHONE_NUMBER: 5,
    PLATFORM_CUT_RATE: 0.24,
  };

  beforeEach(() => {
    getNumber = jest.fn(async (key: string) => {
      if (!(key in RATES)) throw new Error(`Missing or invalid setting: ${key}`);
      return RATES[key];
    });
    service = new SurveyPricingService({ getNumber } as any);
  });

  it('leaves the price alone when the survey does not collect numbers', async () => {
    expect(await service.pricePerResponse(['yes_no'], false)).toBeCloseTo(0.5, 4);
  });

  it('adds the fee once per response when it does', async () => {
    expect(await service.pricePerResponse(['yes_no'], true)).toBeCloseTo(5.5, 4);
  });

  /** One fee per response, not one per question. */
  it('adds the fee once no matter how many questions are asked', async () => {
    expect(await service.pricePerResponse(['yes_no', 'yes_no', 'free_text'], true))
      .toBeCloseTo(0.5 + 0.5 + 2.5 + 5, 4);
  });

  it('defaults to not collecting, so an existing survey is priced as before', async () => {
    expect(await service.pricePerResponse(['yes_no'])).toBeCloseTo(0.5, 4);
  });

  it('carries the fee into the quote a business sees before publishing', async () => {
    const q = await service.quote(['yes_no'], 10, true);
    expect(q.pricePerResponse).toBeCloseTo(5.5, 4);
  });
});
