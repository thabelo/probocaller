import { CHOICE_TYPES, QUESTION_TYPES, feeSettingKey, isMultiSelect, isQuestionType } from './question-type';

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
  it('covers the launch types, single- and multi-select both', () => {
    expect([...QUESTION_TYPES]).toEqual([
      'free_text', 'yes_no', 'multiple_choice', 'multi_select', 'dropdown',
    ]);
  });

  /**
   * multiple_choice and dropdown are PICK ONE and differ only in presentation;
   * multi_select is PICK SEVERAL. They are separate types rather than a flag so
   * each can be priced on its own — choosing several is more work than
   * choosing one — and so an answer's shape is decided by its type alone.
   */
  it('knows which types accept more than one answer', () => {
    expect(isMultiSelect('multi_select')).toBe(true);
    expect(isMultiSelect('multiple_choice')).toBe(false);
    expect(isMultiSelect('dropdown')).toBe(false);
    expect(isMultiSelect('free_text')).toBe(false);
  });

  /** Every type that needs options to pick from, single or multi. */
  it('knows which types need options', () => {
    expect(CHOICE_TYPES).toEqual(['multiple_choice', 'multi_select', 'dropdown']);
  });

  it('derives each type its own settings key', () => {
    expect(feeSettingKey('free_text')).toBe('SURVEY_FEE_FREE_TEXT');
    expect(feeSettingKey('yes_no')).toBe('SURVEY_FEE_YES_NO');
    expect(feeSettingKey('multiple_choice')).toBe('SURVEY_FEE_MULTIPLE_CHOICE');
    expect(feeSettingKey('multi_select')).toBe('SURVEY_FEE_MULTI_SELECT');
    expect(feeSettingKey('dropdown')).toBe('SURVEY_FEE_DROPDOWN');
  });

  it('recognises only known types', () => {
    expect(isQuestionType('yes_no')).toBe(true);
    expect(isQuestionType('essay')).toBe(false);
    expect(isQuestionType('')).toBe(false);
  });
});
