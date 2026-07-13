/**
 * Call-permission policy as two independent dials — a personal-caller policy and a
 * business-caller policy. The six user-facing tiers are named combinations of the
 * two; any other combination is "custom". One engine drives backend gating, mobile
 * on-device screening, and admin config.
 *
 *   1 All calls                 (everyone, free)   — business rings free, you earn nothing
 *   2 All calls + Paid Business (everyone, paid)   — everyone free, business pays
 *   3 Contacts + Paid Business  (contacts, paid)   — contacts free, others blocked, business pays
 *   4 Paid Personal + Paid Biz  (paid,     paid)   — everyone pays
 *   5 Contacts only             (contacts, blocked)— contacts free, no business
 *   6 Do Not Disturb            (blocked,  blocked)— nobody
 */

export type PersonalPolicy = 'everyone' | 'contacts' | 'contacts_paid' | 'paid' | 'blocked';
export type BusinessPolicy = 'free' | 'paid' | 'blocked';
export type CallDecision = 'allow_free' | 'allow_paid' | 'block';

export interface CallPolicy {
  personal: PersonalPolicy;
  business: BusinessPolicy;
}

export const CALL_PRESETS: Record<string, CallPolicy> = {
  all_calls: { personal: 'everyone', business: 'free' },
  all_paid_biz: { personal: 'everyone', business: 'paid' },
  contacts_paid_biz: { personal: 'contacts', business: 'paid' },
  paid_all: { personal: 'paid', business: 'paid' },
  contacts_only: { personal: 'contacts', business: 'blocked' },
  dnd: { personal: 'blocked', business: 'blocked' },
};

/** The preset name for a policy, or 'custom' when it matches none of the six. */
export function presetFor(policy: CallPolicy): string {
  for (const [name, p] of Object.entries(CALL_PRESETS)) {
    if (p.personal === policy.personal && p.business === policy.business) return name;
  }
  return 'custom';
}

/** The (personal, business) dials for a named preset, or null if unknown. */
export function policyForPreset(preset: string): CallPolicy | null {
  return CALL_PRESETS[preset] ?? null;
}

/**
 * The decision for an incoming caller under a policy:
 *  - allow_free: rings, no charge
 *  - allow_paid: rings, the caller pays (business per-second, or personal pay-to-contact)
 *  - block: rejected before ringing
 * `isContact` is only meaningful for personal callers and is evaluated on-device.
 */
export function resolveCallDecision(input: {
  isBusiness: boolean;
  isContact?: boolean;
  personal: PersonalPolicy;
  business: BusinessPolicy;
}): CallDecision {
  if (input.isBusiness) {
    if (input.business === 'blocked') return 'block';
    return input.business === 'paid' ? 'allow_paid' : 'allow_free';
  }
  switch (input.personal) {
    case 'everyone':
      return 'allow_free';
    case 'contacts':
      return input.isContact ? 'allow_free' : 'block';
    case 'contacts_paid':
      return input.isContact ? 'allow_free' : 'allow_paid';
    case 'paid':
      return 'allow_paid';
    case 'blocked':
      return 'block';
    default:
      return 'allow_free'; // fail open on an unknown policy — never silently drop a call
  }
}
