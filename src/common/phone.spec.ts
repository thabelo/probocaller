import { normalisePhoneNumber } from './phone';

describe('normalisePhoneNumber', () => {
  it('keeps an already-international number, cleaned of formatting', () => {
    expect(normalisePhoneNumber('+27 82 555 0001')).toBe('+27825550001');
    expect(normalisePhoneNumber('+267 (71) 234-567')).toBe('+26771234567');
  });

  it('promotes a 00 international prefix', () => {
    expect(normalisePhoneNumber('0027825550001')).toBe('+27825550001');
  });

  it('promotes a South African national number (the format the app already assumes)', () => {
    expect(normalisePhoneNumber('0831119999')).toBe('+27831119999');
    expect(normalisePhoneNumber('27831119999')).toBe('+27831119999');
  });

  it('returns null when no country can be inferred — we never guess', () => {
    expect(normalisePhoneNumber('8001777597779')).toBeNull();
    expect(normalisePhoneNumber('5551234567')).toBeNull();
    expect(normalisePhoneNumber('00000000')).toBeNull();
    expect(normalisePhoneNumber('124567890999')).toBeNull();
    expect(normalisePhoneNumber('')).toBeNull();
    expect(normalisePhoneNumber(undefined)).toBeNull();
  });

  it('rejects a + number whose dial code is not a real country', () => {
    expect(normalisePhoneNumber('+99912345678')).toBeNull();
  });

  it('rejects numbers whose significant digits start with 0 — a dial code never does', () => {
    // Regression: "0000000000" once normalised to "+000000" / "+27000000000".
    expect(normalisePhoneNumber('0000000000')).toBeNull();
    expect(normalisePhoneNumber('00000000')).toBeNull();
    expect(normalisePhoneNumber('+0000000000')).toBeNull();
    expect(normalisePhoneNumber('0027000000000')).toBeNull();
  });

  it('is idempotent', () => {
    const once = normalisePhoneNumber('0831119999')!;
    expect(normalisePhoneNumber(once)).toBe(once);
  });
});
