import { normalisePhoneNumber } from '../common/phone';

/**
 * Equivalent representations of a phone number, so login/lookup matches an
 * account regardless of how it was stored (national "0XXXXXXXXX" vs international
 * "+27XXXXXXXXX"). SA-aware; non-ZA numbers are returned as just the cleaned input.
 */
export function phoneNumberVariants(raw: string): string[] {
  const cleaned = (raw || '').replace(/[\s()-]/g, '');
  if (!cleaned) return [];

  const set = new Set<string>([cleaned]);

  // Derive the SA national significant number (9 digits after the 0/27/+27).
  let nsn = '';
  if (/^\+27\d{9}$/.test(cleaned)) nsn = cleaned.slice(3);
  else if (/^27\d{9}$/.test(cleaned)) nsn = cleaned.slice(2);
  else if (/^0\d{9}$/.test(cleaned)) nsn = cleaned.slice(1);

  if (nsn) {
    set.add('0' + nsn);
    set.add('+27' + nsn);
    set.add('27' + nsn);
  }

  return [...set];
}

/**
 * The international (E.164) form of a number when it can be inferred, otherwise
 * the cleaned input. Clients derive the viewer's region/currency from this, so a
 * ZA account stored nationally ("083…") must still present as "+2783…".
 */
export function toE164(raw: string): string {
  const cleaned = (raw || '').replace(/[\s()-]/g, '');
  if (!cleaned) return '';
  // Canonical rule lives in common/phone. When a country cannot be inferred we
  // surface the number as stored rather than inventing one.
  return normalisePhoneNumber(cleaned) ?? cleaned;
}
