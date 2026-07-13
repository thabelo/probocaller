/**
 * Call-permission policy over FOUR caller categories, each set to free | paid |
 * blocked. The six user-facing tiers are named combinations; any other combination
 * is "custom" (configured via the Add Custom dialog). One engine drives backend
 * gating, mobile on-device screening, and admin config.
 *
 * Categories (resolved by precedence, see categoryFor):
 *   contacts  — in your device contacts
 *   business  — an identified business
 *   newCaller — a first-time caller: has a caller-ID/number but isn't a contact
 *   unknown   — no caller-ID at all (private/withheld/unregistered)
 */

export type CategoryPolicy = 'free' | 'paid' | 'blocked';
export type CallCategory = 'contacts' | 'business' | 'newCaller' | 'unknown';
export type CallDecision = 'allow_free' | 'allow_paid' | 'block';

export type CallPolicy = Record<CallCategory, CategoryPolicy>;

export const CALL_PRESETS: Record<string, CallPolicy> = {
  all_calls: { contacts: 'free', business: 'free', newCaller: 'free', unknown: 'free' },
  all_paid_biz: { contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' },
  contacts_paid_biz: { contacts: 'free', business: 'paid', newCaller: 'blocked', unknown: 'blocked' },
  paid_all: { contacts: 'free', business: 'paid', newCaller: 'paid', unknown: 'paid' },
  contacts_only: { contacts: 'free', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' },
  dnd: { contacts: 'blocked', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' },
};

/** Default for a new user: reachable by everyone, business pays (= all_paid_biz). */
export const DEFAULT_POLICY: CallPolicy = CALL_PRESETS.all_paid_biz;

/** The preset name for a policy, or 'custom' when it matches none of the six. */
export function presetFor(policy: CallPolicy): string {
  for (const [name, p] of Object.entries(CALL_PRESETS)) {
    if (
      p.contacts === policy.contacts &&
      p.business === policy.business &&
      p.newCaller === policy.newCaller &&
      p.unknown === policy.unknown
    ) {
      return name;
    }
  }
  return 'custom';
}

export function policyForPreset(preset: string): CallPolicy | null {
  return CALL_PRESETS[preset] ?? null;
}

/** Which category a caller falls into, by precedence. */
export function categoryFor(input: {
  isContact?: boolean;
  isBusiness?: boolean;
  hasCallerId?: boolean;
}): CallCategory {
  if (input.isContact) return 'contacts';
  if (input.isBusiness) return 'business';
  if (input.hasCallerId === false) return 'unknown';
  return 'newCaller';
}

/**
 * The decision for an incoming caller under a policy:
 *  - allow_free: rings, no charge
 *  - allow_paid: rings, the caller pays (business per-second, or pay-to-contact)
 *  - block: rejected before ringing
 */
export function resolveCallDecision(input: {
  isContact?: boolean;
  isBusiness?: boolean;
  hasCallerId?: boolean;
  policy: CallPolicy;
}): CallDecision {
  const cat = categoryFor(input);
  const p = input.policy[cat];
  return p === 'blocked' ? 'block' : p === 'paid' ? 'allow_paid' : 'allow_free';
}
