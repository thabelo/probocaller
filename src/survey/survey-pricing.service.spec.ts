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
    SURVEY_FEE_DROPDOWN: 0.75,
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

  /** What the business's wallet is actually debited and held at publish (§1.2). */
  it('quotes the escrow total as price per response × target responses', async () => {
    await expect(service.quote(['free_text', 'yes_no'], 100)).resolves.toEqual({
      pricePerResponse: 3,
      targetResponses: 100,
      total: 300,
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
    getNumber.mockImplementation(async (key: string) =>
      key === 'SURVEY_FEE_YES_NO' ? 0.1 : 0.2);

    const { pricePerResponse, total } = await service.quote(['yes_no', 'dropdown'], 3);

    expect(pricePerResponse).toBe(0.3);
    expect(total).toBe(0.9);
  });
});
