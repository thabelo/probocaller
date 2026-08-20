import { RESULT_FLOORS, readResultThresholds } from './survey-results.thresholds';

/**
 * These three numbers are the whole privacy rule for survey results, and they
 * live in an admin-editable table. That is only safe because the reader clamps
 * them one-way: an admin can make the rule stricter and cannot make it weaker.
 *
 * The clamp tests exist BEFORE the reader does, deliberately. Without them,
 * anyone with the settings page could set the minimum cell size to 1 and turn
 * every result into a list of individuals' answers.
 */
describe('readResultThresholds', () => {
  const reader = (values: Record<string, number>) => ({
    getNumber: jest.fn(async (key: string) => {
      if (!(key in values)) throw new Error(`Missing or invalid setting: ${key}`);
      return values[key];
    }),
  }) as any;

  const configured = {
    SURVEY_RESULTS_MIN_CELL: 5,
    SURVEY_RESULTS_RELEASE_THRESHOLD: 10,
    SURVEY_RESULTS_BATCH: 10,
  };

  it('reads the three thresholds from settings', async () => {
    await expect(readResultThresholds(reader(configured))).resolves.toEqual({
      minCell: 5,
      releaseThreshold: 10,
      batch: 10,
    });
  });

  it('clamps a minimum cell size of 1 up to 5', async () => {
    const t = await readResultThresholds(reader({ ...configured, SURVEY_RESULTS_MIN_CELL: 1 }));
    expect(t.minCell).toBe(5);
  });

  it('clamps a release threshold of 2 up to 10', async () => {
    const t = await readResultThresholds(reader({ ...configured, SURVEY_RESULTS_RELEASE_THRESHOLD: 2 }));
    expect(t.releaseThreshold).toBe(10);
  });

  it('clamps a batch size of 1 up to 10', async () => {
    const t = await readResultThresholds(reader({ ...configured, SURVEY_RESULTS_BATCH: 1 }));
    expect(t.batch).toBe(10);
  });

  it('lets an admin make the rule stricter', async () => {
    const t = await readResultThresholds(reader({
      SURVEY_RESULTS_MIN_CELL: 8,
      SURVEY_RESULTS_RELEASE_THRESHOLD: 25,
      SURVEY_RESULTS_BATCH: 25,
    }));
    expect(t).toEqual({ minCell: 8, releaseThreshold: 25, batch: 25 });
  });

  /**
   * A missing row must not be a 500 and must not be a weaker rule. The floors
   * ARE the documented defaults, so falling back to them is the same answer
   * the seed would have given — unlike a money rate, where a stale number
   * would bill someone wrongly and silence is the dangerous option.
   */
  it('falls back to the floors when a setting is missing', async () => {
    await expect(readResultThresholds(reader({}))).resolves.toEqual({
      minCell: RESULT_FLOORS.minCell,
      releaseThreshold: RESULT_FLOORS.releaseThreshold,
      batch: RESULT_FLOORS.batch,
    });
  });

  it('ignores a setting that is not a number', async () => {
    const t = await readResultThresholds(reader({ ...configured, SURVEY_RESULTS_MIN_CELL: NaN }));
    expect(t.minCell).toBe(5);
  });

  it('publishes floors nobody can read past', () => {
    expect(RESULT_FLOORS).toEqual({ minCell: 5, releaseThreshold: 10, batch: 10 });
  });
});
