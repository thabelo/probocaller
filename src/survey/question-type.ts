/**
 * The question types a survey can be built from, and the single source of
 * truth for anything that varies by type.
 *
 * Each type carries its own base fee (surveys-spec §1.1): a survey's price per
 * response is the sum of its questions' type rates, so asking ten free-text
 * questions costs more than asking ten yes/no ones. Rates live in the
 * `settings` table under the derived keys below — admin-configurable, read
 * through SettingsReaderService with no hardcoded fallback, like every other
 * rate on the platform.
 *
 * The spec asks for further types to be added "as data rather than code where
 * possible"; adding one here is enough to seed its rate, price it, and accept
 * it on a question — no other file needs to change.
 */
export const QUESTION_TYPES = ['free_text', 'yes_no', 'multiple_choice', 'dropdown'] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The `settings` key holding this type's base fee, e.g. SURVEY_FEE_YES_NO. */
export function feeSettingKey(type: QuestionType): string {
  return `SURVEY_FEE_${type.toUpperCase()}`;
}

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}
