import { REPEAT_FLOORS, excludeOverSurveyed, readRepeatLimits } from './survey-repeat-limit';

/**
 * Per-survey suppression is disclosure control, not a privacy budget. Every
 * survey can clear the floor on its own while the same business asks the same
 * dozen people something new every week — four surveys in a month is a
 * sixteen-question profile of those twelve, assembled entirely out of results
 * that were individually compliant.
 *
 * The limit is per BUSINESS, deliberately. Someone who installed Surveys to
 * earn can still answer everyone else's; what they are protected from is one
 * party accumulating against them.
 */
describe('excludeOverSurveyed', () => {
  const audience = [1, 2, 3, 4, 5];

  it('leaves an audience alone when nobody is near the limit', () => {
    expect(excludeOverSurveyed(audience, new Map([[1, 1], [2, 2]]), 3)).toEqual(audience);
  });

  it('drops someone this business has already read the limit of times', () => {
    expect(excludeOverSurveyed(audience, new Map([[2, 3], [4, 5]]), 3)).toEqual([1, 3, 5]);
  });

  it('counts nobody as zero rather than excluding them', () => {
    expect(excludeOverSurveyed(audience, new Map(), 3)).toEqual(audience);
  });

  it('keeps someone sitting exactly one below the limit', () => {
    expect(excludeOverSurveyed([7], new Map([[7, 2]]), 3)).toEqual([7]);
  });

  it('preserves the order it was given', () => {
    expect(excludeOverSurveyed([5, 1, 4, 2], new Map([[4, 9]]), 3)).toEqual([5, 1, 2]);
  });

  it('never excludes when the limit is switched off', () => {
    expect(excludeOverSurveyed(audience, new Map([[1, 99]]), 0)).toEqual(audience);
  });
});

describe('readRepeatLimits', () => {
  const reader = (values: Record<string, number>) => ({
    getNumber: jest.fn(async (key: string) => {
      if (!(key in values)) throw new Error(`Missing: ${key}`);
      return values[key];
    }),
  }) as any;

  it('reads the window and the cap from settings', async () => {
    await expect(readRepeatLimits(reader({
      SURVEY_REPEAT_WINDOW_DAYS: 30,
      SURVEY_MAX_PER_RESPONDENT: 3,
    }))).resolves.toEqual({ windowDays: 30, maxPerRespondent: 3 });
  });

  it('falls back to the floors when unset', async () => {
    await expect(readRepeatLimits(reader({}))).resolves.toEqual(REPEAT_FLOORS);
  });

  /**
   * Unlike the results thresholds, this one CAN be loosened — a research panel
   * that grows past a few hundred people has a real case for asking more
   * often, and there is no promise made to a respondent about how many times
   * they may be asked. It is a budget, not an anonymity guarantee, so it is
   * tunable in both directions and simply validated.
   */
  it('accepts a stricter cap and a looser one alike', async () => {
    await expect(readRepeatLimits(reader({
      SURVEY_REPEAT_WINDOW_DAYS: 7, SURVEY_MAX_PER_RESPONDENT: 10,
    }))).resolves.toEqual({ windowDays: 7, maxPerRespondent: 10 });
  });

  it('ignores a nonsense value rather than excluding everybody', async () => {
    await expect(readRepeatLimits(reader({
      SURVEY_REPEAT_WINDOW_DAYS: -5, SURVEY_MAX_PER_RESPONDENT: NaN,
    }))).resolves.toEqual(REPEAT_FLOORS);
  });
});
