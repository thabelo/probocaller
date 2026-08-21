import { bandAudience } from './survey-audience-band';

/**
 * The exact audience count is a reconnaissance oracle. A business can add one
 * filter value at a time and watch the number move: "Gauteng, 25-34" → 40,
 * add "has medical aid" → 39, so exactly one person in that band has no
 * medical aid. Nobody has to answer a survey for that to work, and it costs
 * nothing but requests.
 *
 * Buckets keep the number useful for the only decision it informs — "can my
 * targeting fill the responses I am about to buy?" — while making a
 * one-person change invisible.
 */
describe('bandAudience', () => {
  it('reports nothing below the release threshold beyond that it is too few', () => {
    expect(bandAudience(0)).toEqual({ audienceSize: 0, audienceBand: '<10' });
    expect(bandAudience(9)).toEqual({ audienceSize: 0, audienceBand: '<10' });
  });

  it('rounds down to tens up to a hundred', () => {
    expect(bandAudience(10)).toEqual({ audienceSize: 10, audienceBand: '10-19' });
    expect(bandAudience(47)).toEqual({ audienceSize: 40, audienceBand: '40-49' });
    expect(bandAudience(99)).toEqual({ audienceSize: 90, audienceBand: '90-99' });
  });

  it('widens to fifties above a hundred, where one person matters less', () => {
    expect(bandAudience(100)).toEqual({ audienceSize: 100, audienceBand: '100-149' });
    expect(bandAudience(412)).toEqual({ audienceSize: 400, audienceBand: '400-449' });
    expect(bandAudience(1499)).toEqual({ audienceSize: 1450, audienceBand: '1450-1499' });
  });

  /** The whole point: adding one person must not move the reported figure. */
  it('does not move when a single person joins or leaves the audience', () => {
    for (const n of [41, 42, 43, 44, 45, 46, 47, 48, 49]) {
      expect(bandAudience(n).audienceSize).toBe(40);
    }
  });

  it('never reports more people than there are', () => {
    for (const n of [0, 7, 10, 63, 100, 137, 999]) {
      expect(bandAudience(n).audienceSize).toBeLessThanOrEqual(n);
    }
  });

  it('shrugs off a nonsense count rather than reporting one', () => {
    expect(bandAudience(-1).audienceBand).toBe('<10');
    expect(bandAudience(NaN).audienceBand).toBe('<10');
  });
});
