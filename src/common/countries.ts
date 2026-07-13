import { COUNTRIES } from '../banks/banks-data';

/**
 * Single source of truth for "is this a real country?". Backed by the ISO
 * 3166-1 alpha-2 list already shipped with the banks dataset, so KYB, business
 * registration and anything else agree on the same country universe.
 */
const nameByCode = new Map<string, string>(
  COUNTRIES.map((c) => [c.code.toUpperCase(), c.name]),
);

export function isIsoCountryCode(countryCode: string): boolean {
  if (!countryCode || typeof countryCode !== 'string') return false;
  return nameByCode.has(countryCode.trim().toUpperCase());
}

export function isoCountryName(countryCode: string): string | undefined {
  if (!countryCode || typeof countryCode !== 'string') return undefined;
  return nameByCode.get(countryCode.trim().toUpperCase());
}

/** Upper-cased code when valid, otherwise null. */
export function normaliseCountryCode(countryCode?: string | null): string | null {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const code = countryCode.trim().toUpperCase();
  return nameByCode.has(code) ? code : null;
}
