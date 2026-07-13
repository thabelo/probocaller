import {
  CALL_PRESETS,
  presetFor,
  policyForPreset,
  resolveCallDecision,
} from './call-policy';

describe('call-policy — the 6 tiers as two dials', () => {
  it('defines all six named presets', () => {
    expect(Object.keys(CALL_PRESETS).sort()).toEqual(
      ['all_calls', 'all_paid_biz', 'contacts_only', 'contacts_paid_biz', 'dnd', 'paid_all'].sort(),
    );
  });

  it('maps each preset to its (personal, business) dials', () => {
    expect(CALL_PRESETS.all_calls).toEqual({ personal: 'everyone', business: 'free' });
    expect(CALL_PRESETS.all_paid_biz).toEqual({ personal: 'everyone', business: 'paid' });
    expect(CALL_PRESETS.contacts_paid_biz).toEqual({ personal: 'contacts', business: 'paid' });
    expect(CALL_PRESETS.paid_all).toEqual({ personal: 'paid', business: 'paid' });
    expect(CALL_PRESETS.contacts_only).toEqual({ personal: 'contacts', business: 'blocked' });
    expect(CALL_PRESETS.dnd).toEqual({ personal: 'blocked', business: 'blocked' });
  });

  it('round-trips preset <-> policy, and reports custom for off-preset combos', () => {
    expect(policyForPreset('contacts_paid_biz')).toEqual({ personal: 'contacts', business: 'paid' });
    expect(presetFor({ personal: 'contacts', business: 'paid' })).toBe('contacts_paid_biz');
    // a combo that is not one of the 6 named presets
    expect(presetFor({ personal: 'contacts_paid', business: 'free' })).toBe('custom');
    expect(policyForPreset('nope')).toBeNull();
  });
});

describe('resolveCallDecision — allow_free | allow_paid | block', () => {
  const biz = (business: any) => resolveCallDecision({ isBusiness: true, personal: 'everyone', business });
  const person = (personal: any, isContact = false) =>
    resolveCallDecision({ isBusiness: false, isContact, personal, business: 'paid' });

  it('business: free rings free, paid rings & charges, blocked is rejected', () => {
    expect(biz('free')).toBe('allow_free');
    expect(biz('paid')).toBe('allow_paid');
    expect(biz('blocked')).toBe('block');
  });

  it('personal everyone always rings free', () => {
    expect(person('everyone')).toBe('allow_free');
  });

  it('personal contacts: contact rings free, stranger blocked', () => {
    expect(person('contacts', true)).toBe('allow_free');
    expect(person('contacts', false)).toBe('block');
  });

  it('personal contacts_paid: contact free, stranger pays', () => {
    expect(person('contacts_paid', true)).toBe('allow_free');
    expect(person('contacts_paid', false)).toBe('allow_paid');
  });

  it('personal paid: everyone pays (even a contact)', () => {
    expect(person('paid', true)).toBe('allow_paid');
    expect(person('paid', false)).toBe('allow_paid');
  });

  it('personal blocked: nobody', () => {
    expect(person('blocked', true)).toBe('block');
  });

  // Tier 1 "All calls": personal everyone + business free → the only tier where a
  // business rings for free (you earn nothing).
  it('tier 1 (all_calls) lets business ring free', () => {
    const p = CALL_PRESETS.all_calls;
    expect(resolveCallDecision({ isBusiness: true, personal: p.personal, business: p.business })).toBe('allow_free');
  });
});
