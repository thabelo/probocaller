import { createHmac } from 'crypto';

/**
 * Canonicalise a phone number for matching:
 *   - drop everything except digits and a leading +
 *   - convert ZA local (0XXXXXXXXX) to international (+27XXXXXXXXX)
 * so a number stored as "072 123 4567" and looked up as "+2772…" collide.
 */
export function normalizeNumber(raw: string): string {
  const cleaned = (raw || '').replace(/[^\d+]/g, '');
  // Keep only a leading '+', strip any others.
  const plusStripped = cleaned.replace(/(?!^)\+/g, '');
  if (/^0\d{9}$/.test(plusStripped)) return '+27' + plusStripped.slice(1);
  return plusStripped;
}

// Dev fallback so the app runs locally; production MUST set SUPPRESSION_PEPPER
// (kept out of the DB so a DB leak alone can't be brute-forced back to numbers).
const DEV_PEPPER = 'probo-dev-suppression-pepper';

export function suppressionPepper(): string {
  return process.env.SUPPRESSION_PEPPER || DEV_PEPPER;
}

/**
 * Keyed hash (HMAC-SHA256) of a normalised number. Phone numbers are low-entropy,
 * so a plain hash is trivially reversible — the secret pepper is what makes the
 * stored value non-reversible without the key.
 */
export function hashNumber(raw: string, pepper: string = suppressionPepper()): string {
  return createHmac('sha256', pepper).update(normalizeNumber(raw)).digest('hex');
}
