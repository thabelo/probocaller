import { sanitiseBusinessInfo } from './sanitise-business-info';
import { KybBusinessInfoField } from './kyb-country-config';

/**
 * Backend M10 — `businessInfo: Record<string, any>` arrived from the user with
 * no key whitelist and no value cap. An attacker could post a 5 MB JSON blob
 * and have it stored as `jsonb` indefinitely (cheap DoS). They could also
 * smuggle arbitrary keys that admin tooling later renders, opening render-time
 * surprises down the line.
 *
 * `sanitiseBusinessInfo` enforces:
 *   - keys MUST be in the country requirements whitelist;
 *   - each value is coerced to string, trimmed, capped to MAX_VALUE_LEN;
 *   - the aggregate JSON serialises to under MAX_TOTAL_BYTES;
 *   - non-primitive values are rejected.
 */

const fields = (keys: string[]): KybBusinessInfoField[] =>
  keys.map((k) => ({ key: k, label: k, type: 'text', required: false }));

describe('sanitiseBusinessInfo — Backend M10', () => {
  it('drops keys that are not in the country whitelist', () => {
    const out = sanitiseBusinessInfo(
      { legal_name: 'Acme', not_a_field: 'evil', __proto__: 'evil' as any },
      fields(['legal_name']),
    );
    expect(Object.keys(out)).toEqual(['legal_name']);
    expect(out.legal_name).toBe('Acme');
  });

  it('keeps allowed keys, trims values', () => {
    const out = sanitiseBusinessInfo(
      { legal_name: '  Acme  ', registration_number: '2021/123' },
      fields(['legal_name', 'registration_number']),
    );
    expect(out).toEqual({ legal_name: 'Acme', registration_number: '2021/123' });
  });

  it('caps any single value at MAX_VALUE_LEN (500)', () => {
    const huge = 'a'.repeat(2000);
    const out = sanitiseBusinessInfo({ legal_name: huge }, fields(['legal_name']));
    expect(out.legal_name.length).toBe(500);
  });

  it('rejects non-primitive values (objects, arrays, functions)', () => {
    const out = sanitiseBusinessInfo(
      { legal_name: { nested: 1 } as any, registration_number: ['x'] as any, tax_number: 'ok' },
      fields(['legal_name', 'registration_number', 'tax_number']),
    );
    expect(out.legal_name).toBeUndefined();
    expect(out.registration_number).toBeUndefined();
    expect(out.tax_number).toBe('ok');
  });

  it('coerces numbers and booleans to strings', () => {
    const out = sanitiseBusinessInfo(
      { tax_number: 12345 as any, is_active: true as any },
      fields(['tax_number', 'is_active']),
    );
    expect(out.tax_number).toBe('12345');
    expect(out.is_active).toBe('true');
  });

  it('throws if the aggregate JSON exceeds MAX_TOTAL_BYTES (~50 KB)', () => {
    const big = 'a'.repeat(500);
    // 200 fields × 500 chars ~= 100 KB → over the cap
    const f = Array.from({ length: 200 }, (_, i) => ({
      key: `f${i}`, label: `f${i}`, type: 'text' as const, required: false,
    }));
    const data: Record<string, any> = {};
    for (const x of f) data[x.key] = big;
    expect(() => sanitiseBusinessInfo(data, f)).toThrow(/too large/i);
  });

  it('returns {} for non-object input', () => {
    expect(sanitiseBusinessInfo(null as any, fields(['x']))).toEqual({});
    expect(sanitiseBusinessInfo('hi' as any, fields(['x']))).toEqual({});
    expect(sanitiseBusinessInfo(42 as any, fields(['x']))).toEqual({});
  });
});
