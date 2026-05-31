// TDD GREEN for sanitise-business-info.spec.ts. User authorised the
// remaining MEDIUM/LOW sweep.
//
// Backend M10 — the KYB submission DTO accepted Record<string, any> with no
// key whitelist or size cap. This function projects untrusted input down to:
//   - keys present in the country requirements whitelist;
//   - primitive values (string|number|boolean), trimmed + capped;
//   - an aggregate JSON size under MAX_TOTAL_BYTES.
import { BadRequestException } from '@nestjs/common';
import { KybBusinessInfoField } from './kyb-country-config';

const MAX_VALUE_LEN = 500;
const MAX_TOTAL_BYTES = 50 * 1024; // 50 KB serialised

export function sanitiseBusinessInfo(
  raw: unknown,
  fields: KybBusinessInfoField[],
): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const allowed = new Set(fields.map((f) => f.key));
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (value === null || value === undefined) continue;
    // Reject anything that isn't a primitive scalar.
    if (typeof value === 'object' || typeof value === 'function') continue;
    const asString = String(value).trim();
    if (!asString) continue;
    out[key] = asString.length > MAX_VALUE_LEN ? asString.slice(0, MAX_VALUE_LEN) : asString;
  }

  if (JSON.stringify(out).length > MAX_TOTAL_BYTES) {
    throw new BadRequestException('businessInfo payload too large.');
  }
  return out;
}
