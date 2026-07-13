import { normalizeNumber, hashNumber } from './number-hash';

describe('normalizeNumber', () => {
  it('strips spaces, dashes and parentheses', () => {
    expect(normalizeNumber('072 123-4567')).toBe('+27721234567');
    expect(normalizeNumber('(072) 123 4567')).toBe('+27721234567');
  });

  it('converts a ZA local number (0XXXXXXXXX) to +27 international form', () => {
    expect(normalizeNumber('0821234567')).toBe('+27821234567');
  });

  it('leaves an already-international number unchanged', () => {
    expect(normalizeNumber('+27821234567')).toBe('+27821234567');
  });
});

describe('hashNumber (HMAC-SHA256)', () => {
  const PEPPER = 'test-pepper';

  it('produces a 64-char hex digest', () => {
    expect(hashNumber('0821234567', PEPPER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same number', () => {
    expect(hashNumber('0821234567', PEPPER)).toBe(hashNumber('0821234567', PEPPER));
  });

  it('maps a local and its international form to the same hash', () => {
    expect(hashNumber('0821234567', PEPPER)).toBe(hashNumber('+27821234567', PEPPER));
  });

  it('produces different hashes for different numbers', () => {
    expect(hashNumber('0821234567', PEPPER)).not.toBe(hashNumber('0831234567', PEPPER));
  });

  it('is keyed: a different pepper yields a different hash (not brute-forceable from DB alone)', () => {
    expect(hashNumber('0821234567', 'pepper-a')).not.toBe(hashNumber('0821234567', 'pepper-b'));
  });
});
