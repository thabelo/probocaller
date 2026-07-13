import { phoneNumberVariants, toE164 } from './phone-variants';

describe('phoneNumberVariants', () => {
  it('maps an international ZA number to its national form and back', () => {
    const v = phoneNumberVariants('+27831119999');
    expect(v).toContain('+27831119999');
    expect(v).toContain('0831119999');
    expect(v).toContain('27831119999');
  });

  it('maps a national ZA number to its international form', () => {
    const v = phoneNumberVariants('0831119999');
    expect(v).toContain('0831119999');
    expect(v).toContain('+27831119999');
  });

  it('strips spaces, dashes and parens before deriving variants', () => {
    const v = phoneNumberVariants(' 083 111-9999 ');
    expect(v).toContain('0831119999');
    expect(v).toContain('+27831119999');
  });

  it('leaves a non-ZA number as just itself (cleaned)', () => {
    const v = phoneNumberVariants('+15551234567');
    expect(v).toEqual(['+15551234567']);
  });

  it('returns an empty list for empty input', () => {
    expect(phoneNumberVariants('')).toEqual([]);
    expect(phoneNumberVariants(undefined as any)).toEqual([]);
  });
});

describe('toE164', () => {
  it('promotes a ZA national number to international form', () => {
    expect(toE164('0831119999')).toBe('+27831119999');
    expect(toE164('27831119999')).toBe('+27831119999');
  });

  it('leaves an already-international number alone', () => {
    expect(toE164('+27831119999')).toBe('+27831119999');
    expect(toE164('+2348031234567')).toBe('+2348031234567');
  });

  it('returns the cleaned input when no country can be inferred', () => {
    expect(toE164('9999999999')).toBe('9999999999');
    expect(toE164('')).toBe('');
    expect(toE164(undefined as unknown as string)).toBe('');
  });
});
