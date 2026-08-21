import { RESULT_FLOORS } from './survey-results.thresholds';

/**
 * Report how many people a filter reaches as a BUCKET, never as an exact count.
 *
 * The exact number is a reconnaissance oracle and it does not need a single
 * survey to be published to work. Ask for "Gauteng, 25-34" and get 40; add
 * "has medical aid" and get 39; you have just learned that exactly one person
 * in that band has no medical aid, for the price of two requests. Every
 * suppression rule downstream is defeated before anybody answers anything.
 *
 * Buckets keep the number useful for the only decision it informs — can my
 * targeting fill the responses I am about to buy? — while making a one-person
 * change invisible. The cost is that the shortfall warning becomes
 * approximate, which is a real and deliberate trade.
 *
 * Widths follow how much one person matters: tens up to a hundred, fifties
 * above it. Below the release threshold there is nothing to say except that it
 * is too few, and reporting 6 rather than 7 there would be the sharpest oracle
 * of all — those are exactly the audiences small enough to enumerate.
 */
export interface AudienceBand {
  /** The floor of the bucket. Always <= the true count, never above it. */
  audienceSize: number;
  audienceBand: string;
}

export function bandAudience(count: number): AudienceBand {
  if (!Number.isFinite(count) || count < RESULT_FLOORS.releaseThreshold) {
    return { audienceSize: 0, audienceBand: `<${RESULT_FLOORS.releaseThreshold}` };
  }

  const width = count < 100 ? 10 : 50;
  const floor = Math.floor(count / width) * width;
  return { audienceSize: floor, audienceBand: `${floor}-${floor + width - 1}` };
}
