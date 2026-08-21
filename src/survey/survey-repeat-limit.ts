/**
 * How often one business may come back to the same person.
 *
 * Everything else in the results pipeline protects a SINGLE survey: cohorts of
 * ten, cells of five, bands, redaction. All of it is disclosure control, and
 * none of it is a privacy budget. A business can clear every one of those
 * rules every week and still assemble a sixteen-question profile of the same
 * twelve people inside a month, purely out of results that were individually
 * compliant. Per-survey k does not compose.
 *
 * The limit is per BUSINESS rather than global, deliberately. Someone who
 * installed Surveys to earn should keep earning from everyone else's surveys;
 * what they are protected from is one party accumulating against them.
 *
 * It is applied at MATCHING, not at publish, so the person is simply never
 * offered the survey. The alternative — refusing the publish — punishes the
 * business for the composition of an audience it cannot see and cannot fix,
 * and would leak the fact that these particular people have been surveyed
 * before. Falling below the publish floor is a consequence, and the message
 * there already says to widen the targeting.
 */
export interface RepeatLimits {
  windowDays: number;
  maxPerRespondent: number;
}

/**
 * Defaults, not floors in the one-way sense: unlike the anonymity thresholds
 * this may be loosened. Nothing is promised to a respondent about how many
 * times they may be asked, and a panel that grows past a few hundred people
 * has a real case for asking more often. It is a budget, so it is tunable in
 * both directions — only nonsense is rejected.
 */
export const REPEAT_FLOORS: RepeatLimits = {
  windowDays: 30,
  maxPerRespondent: 3,
};

interface NumberReader {
  getNumber(key: string): Promise<number>;
}

async function readPositive(reader: NumberReader, key: string, fallback: number): Promise<number> {
  try {
    const value = await reader.getNumber(key);
    // Zero is meaningful for the cap (switch the limit off) but not for the
    // window, so both are guarded the same way and zero falls through to the
    // explicit switch-off check in excludeOverSurveyed.
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function readRepeatLimits(reader: NumberReader): Promise<RepeatLimits> {
  const [windowDays, maxPerRespondent] = await Promise.all([
    readPositive(reader, 'SURVEY_REPEAT_WINDOW_DAYS', REPEAT_FLOORS.windowDays),
    readPositive(reader, 'SURVEY_MAX_PER_RESPONDENT', REPEAT_FLOORS.maxPerRespondent),
  ]);
  return {
    windowDays: windowDays > 0 ? windowDays : REPEAT_FLOORS.windowDays,
    maxPerRespondent,
  };
}

/**
 * Drop anyone this business has already read the cap of times inside the
 * window. `alreadyRead` is keyed by user id; anyone absent has been read zero
 * times, which is the overwhelmingly common case.
 */
export function excludeOverSurveyed(
  audience: number[],
  alreadyRead: Map<number, number>,
  maxPerRespondent: number,
): number[] {
  // A cap of zero switches the budget off rather than excluding everybody —
  // the reading that empties every audience is never the intended one.
  if (!maxPerRespondent || maxPerRespondent <= 0) return audience;
  return audience.filter((userId) => (alreadyRead.get(userId) ?? 0) < maxPerRespondent);
}
