import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsReaderService } from '../config/settings-reader.service';
import { QuestionType, feeSettingKey, isQuestionType } from './question-type';

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

  async pricePerResponse(questionTypes: QuestionType[]): Promise<number> {
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

    return toCents(questionTypes.reduce((sum, type) => sum + rates.get(type)!, 0));
  }

  /**
   * The full escrow quote for publishing: what one response costs, how many
   * are being bought, and the total held against the business's wallet.
   */
  async quote(
    questionTypes: QuestionType[],
    targetResponses: number,
  ): Promise<{ pricePerResponse: number; targetResponses: number; total: number }> {
    if (!Number.isInteger(targetResponses) || targetResponses <= 0) {
      throw new BadRequestException('Target responses must be a whole number greater than zero');
    }

    const pricePerResponse = await this.pricePerResponse(questionTypes);
    return {
      pricePerResponse,
      targetResponses,
      total: toCents(pricePerResponse * targetResponses),
    };
  }
}
