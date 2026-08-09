import { BadRequestException } from '@nestjs/common';
import { getCountryFicaConfig } from './fica-country-config';

/**
 * South African personal KYC keeps today's tailored 4-document set. Every
 * other real country gets a simpler generic 3-document set (one combined ID
 * photo instead of front+back). This is deliberately a two-tier system, not
 * exhaustive per-country research — see src/kyb/kyb-country-config.ts for
 * contrast (that one IS exhaustive; this one is not, by design).
 */
describe('getCountryFicaConfig', () => {
  it('returns the ZA tailored config with the existing 4 documents', () => {
    const cfg = getCountryFicaConfig('ZA');
    expect(cfg.countryCode).toBe('ZA');
    expect(cfg.tailored).toBe(true);
    expect(cfg.documents.map((d) => d.key)).toEqual([
      'id_front',
      'id_back',
      'proof_of_address',
      'selfie',
    ]);
  });

  it('defaults to ZA when no country code is given', () => {
    const cfg = getCountryFicaConfig();
    expect(cfg.countryCode).toBe('ZA');
    expect(cfg.tailored).toBe(true);
  });

  it('defaults to ZA for an empty string', () => {
    const cfg = getCountryFicaConfig('');
    expect(cfg.countryCode).toBe('ZA');
  });

  it('is case-insensitive', () => {
    expect(getCountryFicaConfig('za').countryCode).toBe('ZA');
  });

  it('returns the generic fallback for any other valid ISO country', () => {
    const cfg = getCountryFicaConfig('NG');
    expect(cfg.countryCode).toBe('NG');
    expect(cfg.tailored).toBe(false);
    expect(cfg.documents.map((d) => d.key)).toEqual([
      'id_document',
      'proof_of_address',
      'selfie',
    ]);
  });

  it('throws for a code that fails ISO validation', () => {
    expect(() => getCountryFicaConfig('XX')).toThrow(BadRequestException);
  });
});
