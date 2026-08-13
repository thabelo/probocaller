import { getMetadataArgsStorage } from 'typeorm';
import { SurveyAnswer } from './survey-answer.entity';

/** One answer to one question, inside one response. */
describe('SurveyAnswer entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === SurveyAnswer)
      .map((c) => c.propertyName);

  const column = (name: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === SurveyAnswer && c.propertyName === name,
    );

  it('links an answer to its response and its question', () => {
    expect(columns()).toEqual(expect.arrayContaining(['responseId', 'questionId']));
  });

  /**
   * Free text, yes/no and a single choice are all one value; multi-select is
   * several. Whether multiple choice is single- or multi-select is still open
   * (§3.1), so both shapes are storable now — settling it later must not need
   * a migration over live answers.
   */
  it('stores a single value or several without needing a migration between them', () => {
    expect(column('valueText')?.options.nullable).toBe(true);
    expect(column('valueJson')?.options.nullable).toBe(true);
  });

  it('answers only one question per response', () => {
    const index = getMetadataArgsStorage().indices.find((i) => i.target === SurveyAnswer);
    expect(index?.unique).toBe(true);
    expect(index?.columns).toEqual(['responseId', 'questionId']);
  });
});
