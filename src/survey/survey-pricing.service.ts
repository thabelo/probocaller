import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsReaderService } from '../config/settings-reader.service';
import { QuestionType, feeSettingKey, isQuestionType } from './question-type';

/**
 * What publishing a survey costs, broken into the parts that move separately:
 * `respondentTotal` is the pot respondents are paid from and is what gets
 * refunded if unspent; `platformFee` is the platform's share on top; `total`
 * is what leaves the wallet.
 */
export interface SurveyQuote {
  /** What ONE respondent earns for completing it. Never reduced by the cut. */
  pricePerResponse: number;
  targetResponses: number;
  respondentTotal: number;
  platformFee: number;
  total: number;
}

/** Round to cents, so escrow holds and their refunds still reconcile. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * What a survey costs, and therefore what its respondents earn.
 *
 * Price per response is the sum of the questions' type rates (surveys-spec
 * §1.1) — priced by the work asked of the person answering, not per question
 * flat. Publishing debits and HOLDS `price per response × target responses`
 * (§1.2), which is what `quote()` returns: the escrow figure a business is
 * shown before it commits, and the same one the wallet is debited by.
 *
 * Rates are read live through SettingsReaderService with no hardcoded
 * fallback. A missing rate throws rather than quoting a stale number — this is
 * the amount someone's wallet moves by.
 */
@Injectable()
export class SurveyPricingService {
  constructor(private readonly settingsReader: SettingsReaderService) {}

  /**
   * @param collectPhoneNumber Whether this survey asks respondents for their
   *   number. Adds SURVEY_FEE_PHONE_NUMBER once per response — its own price,
   *   independent of the data-broking PHONE_NUMBER_CREDIT_COST, because a
   *   survey buys a number in the narrow context of that survey.
   */
  async pricePerResponse(
    questionTypes: QuestionType[],
    collectPhoneNumber = false,
  ): Promise<number> {
    if (questionTypes.length === 0) {
      throw new BadRequestException('A survey must have at least one question');
    }
    for (const type of questionTypes) {
      if (!isQuestionType(type)) {
        throw new BadRequestException(`Unknown question type: ${type}`);
      }
    }

    // Read each DISTINCT rate once — a fifty-question survey is one settings
    // read per type, not per question.
    const distinct = [...new Set(questionTypes)];
    const rates = new Map<QuestionType, number>();
    await Promise.all(
      distinct.map(async (type) =>
        rates.set(type, await this.settingsReader.getNumber(feeSettingKey(type))),
      ),
    );

    const questionsTotal = questionTypes.reduce((sum, type) => sum + rates.get(type)!, 0);
    // Once per response, not once per question — the number is one datum
    // however many things the survey asks alongside it.
    const phoneFee = collectPhoneNumber
      ? await this.settingsReader.getNumber('SURVEY_FEE_PHONE_NUMBER')
      : 0;

    return toCents(questionsTotal + phoneFee);
  }

  /**
   * How many responses a BUDGET buys.
   *
   * A business thinks in money — "I have R500 for this" — not in response
   * counts. Turning one into the other needs the question rates AND the
   * platform cut, so it can only be answered here: a client dividing a budget
   * by a fee it guessed would promise responses the wallet cannot cover.
   *
   * Rounds DOWN, because a part of a response is not a response, and the total
   * it returns is guaranteed to fit inside the budget.
   */
  async quoteForBudget(
    questionTypes: QuestionType[],
    budget: number,
    collectPhoneNumber = false,
  ): Promise<SurveyQuote> {
    if (!Number.isFinite(budget) || budget <= 0) {
      throw new BadRequestException('Give a budget greater than zero.');
    }

    const [pricePerResponse, cutRate] = await Promise.all([
      this.pricePerResponse(questionTypes, collectPhoneNumber),
      this.settingsReader.getNumber('PLATFORM_CUT_RATE'),
    ]);

    const costPerResponse = toCents(pricePerResponse * (1 + cutRate));
    const targetResponses = Math.floor(budget / costPerResponse);

    if (targetResponses < 1) {
      throw new BadRequestException(
        `One response costs ${costPerResponse.toFixed(2)}, so a budget of ${budget.toFixed(2)} buys none. Ask less of people, or raise the budget.`,
      );
    }

    return this.quote(questionTypes, targetResponses, collectPhoneNumber);
  }

  /**
   * The full escrow quote for publishing: what one respondent earns, how many
   * responses are being bought, the platform's share, and the total held
   * against the business's wallet.
   *
   * The platform cut is added ON TOP of the respondent pot rather than taken
   * out of it. A respondent is shown what a survey pays before starting
   * (§1.3), so a cut deducted from their fee would quietly pay them less than
   * the figure they agreed to.
   */
  async quote(
    questionTypes: QuestionType[],
    targetResponses: number,
    collectPhoneNumber = false,
  ): Promise<SurveyQuote> {
    if (!Number.isInteger(targetResponses) || targetResponses <= 0) {
      throw new BadRequestException('Target responses must be a whole number greater than zero');
    }

    const [pricePerResponse, cutRate] = await Promise.all([
      this.pricePerResponse(questionTypes, collectPhoneNumber),
      this.settingsReader.getNumber('PLATFORM_CUT_RATE'),
    ]);

    const respondentTotal = toCents(pricePerResponse * targetResponses);
    const platformFee = toCents(respondentTotal * cutRate);

    return {
      pricePerResponse,
      targetResponses,
      respondentTotal,
      platformFee,
      total: toCents(respondentTotal + platformFee),
    };
  }
}
