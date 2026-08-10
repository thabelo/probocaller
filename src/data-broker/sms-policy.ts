/**
 * SMS-permission policy over FOUR sender categories, each set to free | paid |
 * blocked. Independent, sibling system to call/call-policy.ts — SMS billing is
 * a flat per-message rate (SMS_RATE_PER_MESSAGE), not per-second, and none of
 * these columns/values are shared with the call-permission ones.
 *
 * Categories:
 *   contacts  — in your device contacts
 *   business  — an identified business
 *   newSender — a first-time sender: has a sender ID but isn't a contact
 *   unknown   — no sender ID at all
 */

export type SmsCategoryPolicy = 'free' | 'paid' | 'blocked';
export type SmsCategory = 'contacts' | 'business' | 'newSender' | 'unknown';

export type SmsPolicy = Record<SmsCategory, SmsCategoryPolicy>;

export const SMS_PRESETS: Record<string, SmsPolicy> = {
  all_messages: { contacts: 'free', business: 'free', newSender: 'free', unknown: 'free' },
  all_paid_biz: { contacts: 'free', business: 'paid', newSender: 'free', unknown: 'free' },
  contacts_paid_biz: { contacts: 'free', business: 'paid', newSender: 'blocked', unknown: 'blocked' },
  paid_all: { contacts: 'free', business: 'paid', newSender: 'paid', unknown: 'paid' },
  contacts_only: { contacts: 'free', business: 'blocked', newSender: 'blocked', unknown: 'blocked' },
  dnd: { contacts: 'blocked', business: 'blocked', newSender: 'blocked', unknown: 'blocked' },
};

/** Default for a new user: reachable by everyone, business pays (= all_paid_biz). */
export const DEFAULT_SMS_POLICY: SmsPolicy = SMS_PRESETS.all_paid_biz;

/** The preset name for a policy, or 'custom' when it matches none of the six. */
export function presetForSms(policy: SmsPolicy): string {
  for (const [name, p] of Object.entries(SMS_PRESETS)) {
    if (
      p.contacts === policy.contacts &&
      p.business === policy.business &&
      p.newSender === policy.newSender &&
      p.unknown === policy.unknown
    ) {
      return name;
    }
  }
  return 'custom';
}

export function policyForSmsPreset(preset: string): SmsPolicy | null {
  return SMS_PRESETS[preset] ?? null;
}
