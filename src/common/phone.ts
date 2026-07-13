import { COUNTRIES } from '../banks/banks-data';

// Longest dial code first, so +234 (Nigeria) wins over a shorter prefix.
const DIAL_CODES = [...COUNTRIES]
  .map((c) => String(c.dialCode).replace('+', ''))
  .sort((a, b) => b.length - a.length);

/** The longest dial code that prefixes these digits, or undefined. */
const matchDialCode = (digits: string) => DIAL_CODES.find((d) => digits.startsWith(d));

/**
 * The canonical E.164 form of a phone number, or null when no country can be
 * inferred. Numbers are stored and displayed in this form.
 *
 * We never guess a country: a bare national number like "5551234567" could be
 * anywhere, so it returns null and the caller must ask for the country code.
 * The one exception is the South African national format ("0" + 9 digits),
 * which the app has always treated as +27 (it is how login matches accounts).
 */
export function normalisePhoneNumber(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let s = raw.replace(/[\s\-().]/g, '');
  if (!s) return null;

  if (s.startsWith('00')) s = '+' + s.slice(2);

  if (s.startsWith('+')) {
    const digits = s.slice(1);
    // A country dial code never begins with 0.
    if (!/^[1-9]\d{5,14}$/.test(digits)) return null;

    const dial = matchDialCode(digits);
    if (!dial) return null;

    // Nor does the national significant number that follows it, so
    // "+27000000000" is not a phone number.
    const national = digits.slice(dial.length);
    if (!/^[1-9]\d{3,}$/.test(national)) return null;

    return '+' + digits;
  }

  // A national significant number never starts with 0 either, so "0000000000"
  // is not a phone number — it must not become "+27000000000".
  // SA national significant number: 0XXXXXXXXX -> +27XXXXXXXXX
  if (/^0[1-9]\d{8}$/.test(s)) return '+27' + s.slice(1);
  // SA without the plus: 27XXXXXXXXX -> +27XXXXXXXXX
  if (/^27[1-9]\d{8}$/.test(s)) return '+' + s;

  return null;
}
