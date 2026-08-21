import { staleUsers } from './profile-staleness';

/**
 * Who should be asked whether anything has changed.
 *
 * A profile that has not moved in months is matched to fewer surveys and worse
 * offers, so asking is in the person's interest as much as the platform's.
 * That is only true if it stays a QUESTION — asked rarely, easy to ignore,
 * and never a condition of anything.
 */
describe('staleUsers', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date('2026-06-01T00:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * day);

  const rules = { staleAfterDays: 90, cooldownDays: 30 };

  it('asks someone whose profile has not moved in months', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(120), lastAskedAt: null, filledFields: 6 },
    ], rules, now).map((u) => u.userId)).toEqual([1]);
  });

  it('leaves alone someone who updated recently', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(10), lastAskedAt: null, filledFields: 6 },
    ], rules, now)).toEqual([]);
  });

  /** The whole difference between a nudge and nagging. */
  it('does not ask again inside the cooldown', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(200), lastAskedAt: ago(5), filledFields: 6 },
    ], rules, now)).toEqual([]);
  });

  it('asks again once the cooldown has passed', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(200), lastAskedAt: ago(40), filledFields: 6 },
    ], rules, now).map((u) => u.userId)).toEqual([1]);
  });

  /**
   * Somebody who has never filled anything in is not STALE, they never
   * started — and "has anything changed?" is the wrong question to ask them.
   * That is an onboarding problem and it needs different words.
   */
  it('does not ask "has anything changed" of an empty profile', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: null, lastAskedAt: null, filledFields: 0 },
    ], rules, now)).toEqual([]);
  });

  it('asks someone who filled a profile long ago and never returned', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: null, lastAskedAt: null, filledFields: 5 },
    ], rules, now).map((u) => u.userId)).toEqual([1]);
  });

  it('puts the longest-neglected first, so a capped run reaches them', () => {
    const picked = staleUsers([
      { userId: 1, lastChangedAt: ago(100), lastAskedAt: null, filledFields: 3 },
      { userId: 2, lastChangedAt: ago(400), lastAskedAt: null, filledFields: 3 },
      { userId: 3, lastChangedAt: ago(200), lastAskedAt: null, filledFields: 3 },
    ], rules, now);
    expect(picked.map((u) => u.userId)).toEqual([2, 3, 1]);
  });

  it('says how long it has been, so the message can be specific', () => {
    const [picked] = staleUsers([
      { userId: 1, lastChangedAt: ago(120), lastAskedAt: null, filledFields: 6 },
    ], rules, now);
    expect(picked.daysSinceChange).toBe(120);
  });

  it('switches off entirely when the threshold is zero', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(999), lastAskedAt: null, filledFields: 6 },
    ], { staleAfterDays: 0, cooldownDays: 30 }, now)).toEqual([]);
  });

  it('treats exactly the threshold as not yet stale', () => {
    expect(staleUsers([
      { userId: 1, lastChangedAt: ago(90), lastAskedAt: null, filledFields: 6 },
    ], rules, now)).toEqual([]);
  });
});
