import { isIsoCountryCode, isoCountryName, normaliseCountryCode } from './countries';

describe('ISO country helpers', () => {
  it('recognises real ISO 3166-1 alpha-2 codes, case-insensitively', () => {
    expect(isIsoCountryCode('ZA')).toBe(true);
    expect(isIsoCountryCode('bw')).toBe(true);
    expect(isIsoCountryCode('LI')).toBe(true);
  });

  it('rejects codes that are not countries', () => {
    expect(isIsoCountryCode('XX')).toBe(false);
    expect(isIsoCountryCode('ZZ')).toBe(false);
    expect(isIsoCountryCode('')).toBe(false);
    expect(isIsoCountryCode(undefined as unknown as string)).toBe(false);
    expect(isIsoCountryCode('ZAF')).toBe(false);
  });

  it('resolves the country name', () => {
    expect(isoCountryName('ZA')).toBe('South Africa');
    expect(isoCountryName('bw')).toBe('Botswana');
    expect(isoCountryName('XX')).toBeUndefined();
  });

  it('normalises a valid code to upper case and returns null otherwise', () => {
    expect(normaliseCountryCode(' za ')).toBe('ZA');
    expect(normaliseCountryCode('XX')).toBeNull();
    expect(normaliseCountryCode(undefined)).toBeNull();
  });
});
