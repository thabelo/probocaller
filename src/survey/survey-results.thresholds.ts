/**
 * The three numbers that decide how much of a survey's answers reach the
 * business that paid for them.
 *
 * `minCell`      the smallest group a result may count exactly. Fewer than
 *                this and the option is held back — a count of 2 in a survey
 *                a business targeted at one suburb is a pair of people, not a
 *                statistic.
 * `releaseThreshold`  how many answers must be in before anything is shown at
 *                all, and the smallest audience a survey may be published to.
 * `batch`        answers are released in whole groups of this size, so no
 *                single response ever moves a published number. That is what
 *                stops a business polling the endpoint and reading each new
 *                arrival by subtraction.
 *
 * They are read from `settings` because every other exposure and money rule on
 * this platform is admin-tunable, and an operator answering to a regulator
 * needs to raise them without waiting for a deploy.
 *
 * They are CLAMPED here, one way. Math.max against the floors means the
 * settings table can only ever make the rule stricter. Without the clamp,
 * anyone who can reach the admin settings page could set the minimum cell size
 * to 1 and turn every survey result into a list of individuals' answers — the
 * exact thing respondents were promised would never happen. A rule that
 * protects people must not be weakenable from a CRUD screen.
 */
export interface ResultThresholds {
  minCell: number;
  releaseThreshold: number;
  batch: number;
}

/** The strictest the settings table may be read as — and the defaults. */
export const RESULT_FLOORS: ResultThresholds = {
  minCell: 5,
  releaseThreshold: 10,
  batch: 10,
};

interface NumberReader {
  getNumber(key: string): Promise<number>;
}

/**
 * A missing or unreadable row falls back to the floor rather than throwing.
 *
 * That is the opposite of how a RATE is read (SettingsReaderService throws, so
 * nobody is ever billed at a stale hardcoded number) and it is deliberate: the
 * floor here is not a guess at a business decision, it IS the documented
 * default, and falling back to it can only ever be stricter than what was
 * configured. Silence is the safe direction for a rule that withholds data.
 */
async function readClamped(reader: NumberReader, key: string, floor: number): Promise<number> {
  try {
    const value = await reader.getNumber(key);
    return Number.isFinite(value) ? Math.max(floor, value) : floor;
  } catch {
    return floor;
  }
}

export async function readResultThresholds(reader: NumberReader): Promise<ResultThresholds> {
  const [minCell, releaseThreshold, batch] = await Promise.all([
    readClamped(reader, 'SURVEY_RESULTS_MIN_CELL', RESULT_FLOORS.minCell),
    readClamped(reader, 'SURVEY_RESULTS_RELEASE_THRESHOLD', RESULT_FLOORS.releaseThreshold),
    readClamped(reader, 'SURVEY_RESULTS_BATCH', RESULT_FLOORS.batch),
  ]);
  return { minCell, releaseThreshold, batch };
}
