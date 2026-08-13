import { getMetadataArgsStorage } from 'typeorm';
import { SurveyResponse } from './survey-response.entity';

/**
 * One person's run at one survey.
 *
 * This row is where the privacy line is drawn (§2.1). It stores `userId`,
 * because payment and de-duplication need it — but no endpoint may ever return
 * it to a business. A business sees answers plus the demographic bands it
 * targeted, never an identity, exactly as Databroker's consent sheet promises.
 */
describe('SurveyResponse entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === SurveyResponse)
      .map((c) => c.propertyName);

  const column = (name: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === SurveyResponse && c.propertyName === name,
    );

  it('links a respondent to a survey', () => {
    expect(columns()).toEqual(expect.arrayContaining(['surveyId', 'userId']));
  });

  /**
   * Payout fires on SUBMIT, not per question (§1.3): answering six of ten and
   * abandoning earns nothing and costs the business nothing. So an unsubmitted
   * run has to be distinguishable from a completed one.
   */
  it('separates started from submitted, since only completion pays', () => {
    expect(columns()).toContain('startedAt');
    expect(column('submittedAt')?.options.nullable).toBe(true);
  });

  it('records what was actually paid out of the escrow pot', () => {
    expect(column('amountPaid')?.options.type).toBe('decimal');
  });

  /**
   * One response per person per survey. Enforced in the database, not by a
   * check-then-insert in the service — two concurrent submissions would both
   * pass a read and both get paid out of the same pot.
   */
  it('allows a person only one response per survey', () => {
    const index = getMetadataArgsStorage().indices.find((i) => i.target === SurveyResponse);
    expect(index?.unique).toBe(true);
    expect(index?.columns).toEqual(['surveyId', 'userId']);
  });
});
