import { getMetadataArgsStorage } from 'typeorm';
import { SurveyQuestion } from './survey-question.entity';

/**
 * One question on a survey. Its TYPE is what it costs (§1.1), so the type is
 * not decoration — it is the price.
 */
describe('SurveyQuestion entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === SurveyQuestion)
      .map((c) => c.propertyName);

  const column = (name: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === SurveyQuestion && c.propertyName === name,
    );

  it('belongs to a survey and carries a type and a prompt', () => {
    expect(columns()).toEqual(expect.arrayContaining(['surveyId', 'type', 'prompt']));
  });

  it('keeps an explicit order rather than relying on insertion order', () => {
    expect(columns()).toContain('position');
  });

  /** Multiple choice and dropdown need their options; free text and yes/no don't. */
  it('stores choices as nullable structured data', () => {
    expect(column('optionsJson')?.options.nullable).toBe(true);
  });

  /**
   * The rate this question was priced at when the survey was published.
   * Without it, an admin retuning SURVEY_FEE_FREE_TEXT would silently change
   * what an already-escrowed survey owes its respondents, and the pot would
   * stop reconciling against what was held.
   */
  it('freezes the fee it was priced at, so a rate change cannot rewrite history', () => {
    expect(column('feeAtPublish')?.options.type).toBe('decimal');
  });
});
