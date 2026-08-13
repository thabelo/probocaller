import { QUESTION_TYPES, feeSettingKey, isQuestionType } from './question-type';

/**
 * A survey's price per response is the sum of its questions' type rates
 * (surveys-spec §1.1) — a ten-question free-text survey costs more than ten
 * yes/no questions because it asks more of the person answering.
 *
 * The type list is the single source of truth: it drives the fee settings
 * seeded at boot, the pricing sum, and validation of an incoming question.
 * Adding a type must not require touching three places.
 */
describe('survey question types', () => {
  it('covers the four launch types', () => {
    expect([...QUESTION_TYPES]).toEqual(['free_text', 'yes_no', 'multiple_choice', 'dropdown']);
  });

  it('derives each type its own settings key', () => {
    expect(feeSettingKey('free_text')).toBe('SURVEY_FEE_FREE_TEXT');
    expect(feeSettingKey('yes_no')).toBe('SURVEY_FEE_YES_NO');
    expect(feeSettingKey('multiple_choice')).toBe('SURVEY_FEE_MULTIPLE_CHOICE');
    expect(feeSettingKey('dropdown')).toBe('SURVEY_FEE_DROPDOWN');
  });

  it('recognises only known types', () => {
    expect(isQuestionType('yes_no')).toBe(true);
    expect(isQuestionType('essay')).toBe(false);
    expect(isQuestionType('')).toBe(false);
  });
});
