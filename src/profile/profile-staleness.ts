/**
 * Who should be asked whether anything on their profile has changed.
 *
 * A profile that has not moved in months is matched to fewer surveys and worse
 * offers, so asking is genuinely in the person's interest and not only the
 * platform's. That stays true only while it remains a QUESTION: asked rarely,
 * trivial to ignore, and never a condition of anything. The cooldown below is
 * the difference between a nudge and nagging, and it is the reason this is a
 * pure function with a table of cases rather than a query with a LIMIT.
 *
 * Pure, so the rule about how often we are allowed to interrupt somebody is
 * decided in one readable place.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StalenessRules {
  /** Untouched for longer than this, and it is worth asking. 0 switches it off. */
  staleAfterDays: number;
  /** Never ask the same person twice inside this. */
  cooldownDays: number;
}

export interface ProfileActivity {
  userId: number;
  /** When they last changed anything. Null if they never have. */
  lastChangedAt: Date | null;
  /** When we last asked. Null if we never have. */
  lastAskedAt: Date | null;
  /** How many fields hold a value. Zero means they never started. */
  filledFields: number;
}

export interface StaleProfile {
  userId: number;
  /** Null when they have never changed anything since first filling it in. */
  daysSinceChange: number | null;
}

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);

export function staleUsers(
  activity: ProfileActivity[],
  { staleAfterDays, cooldownDays }: StalenessRules,
  now: Date = new Date(),
): StaleProfile[] {
  if (!staleAfterDays || staleAfterDays <= 0) return [];

  return activity
    .filter((person) => {
      // Never filled anything in? They are not stale, they never started, and
      // "has anything changed?" is the wrong question — that is an onboarding
      // problem and it needs different words.
      if (person.filledFields <= 0) return false;

      if (person.lastAskedAt && daysBetween(person.lastAskedAt, now) < cooldownDays) return false;

      // Never changed anything since first filling it in is the most stale
      // case there is, not an exemption from the rule.
      if (!person.lastChangedAt) return true;

      return daysBetween(person.lastChangedAt, now) > staleAfterDays;
    })
    // Longest-neglected first, so a capped run reaches the people it matters
    // most for rather than whoever happened to sort first.
    .sort((a, b) => {
      const at = a.lastChangedAt?.getTime() ?? 0;
      const bt = b.lastChangedAt?.getTime() ?? 0;
      return at - bt;
    })
    .map((person) => ({
      userId: person.userId,
      daysSinceChange: person.lastChangedAt ? daysBetween(person.lastChangedAt, now) : null,
    }));
}
