import {
  CALL_PRESETS,
  presetFor,
  policyForPreset,
  categoryFor,
  resolveCallDecision,
  DEFAULT_POLICY,
} from './call-policy';

describe('call-policy — four caller categories', () => {
  it('defines the six presets over the four categories', () => {
    expect(CALL_PRESETS.all_calls).toEqual({ contacts: 'free', business: 'free', newCaller: 'free', unknown: 'free' });
    expect(CALL_PRESETS.all_paid_biz).toEqual({ contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' });
    expect(CALL_PRESETS.contacts_paid_biz).toEqual({ contacts: 'free', business: 'paid', newCaller: 'blocked', unknown: 'blocked' });
    expect(CALL_PRESETS.paid_all).toEqual({ contacts: 'free', business: 'paid', newCaller: 'paid', unknown: 'paid' });
    expect(CALL_PRESETS.contacts_only).toEqual({ contacts: 'free', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' });
    expect(CALL_PRESETS.dnd).toEqual({ contacts: 'blocked', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' });
  });

  it('round-trips preset <-> policy, custom for off-preset', () => {
    expect(policyForPreset('all_paid_biz')).toEqual(CALL_PRESETS.all_paid_biz);
    expect(presetFor(CALL_PRESETS.contacts_paid_biz)).toBe('contacts_paid_biz');
    expect(presetFor({ contacts: 'free', business: 'paid', newCaller: 'paid', unknown: 'blocked' })).toBe('custom');
    expect(policyForPreset('nope')).toBeNull();
  });
});

describe('categoryFor — which bucket a caller falls into (by precedence)', () => {
  it('contacts win over everything', () => {
    expect(categoryFor({ isContact: true, isBusiness: true, hasCallerId: true })).toBe('contacts');
  });
  it('business next', () => {
    expect(categoryFor({ isBusiness: true, hasCallerId: true })).toBe('business');
  });
  it('no caller-ID → unknown', () => {
    expect(categoryFor({ hasCallerId: false })).toBe('unknown');
  });
  it('identified personal non-contact → new (first-time caller)', () => {
    expect(categoryFor({ hasCallerId: true })).toBe('newCaller');
  });
});

describe('resolveCallDecision', () => {
  const decide = (signals: any, policy: any) => resolveCallDecision({ ...signals, policy });

  it('maps each category policy to allow_free | allow_paid | block', () => {
    const p = { contacts: 'free', business: 'paid', newCaller: 'blocked', unknown: 'paid' };
    expect(decide({ isContact: true }, p)).toBe('allow_free');
    expect(decide({ isBusiness: true }, p)).toBe('allow_paid');
    expect(decide({ hasCallerId: true }, p)).toBe('block');       // new → blocked
    expect(decide({ hasCallerId: false }, p)).toBe('allow_paid'); // unknown → paid
  });

  it('DEFAULT_POLICY keeps everyone reachable with paid business', () => {
    expect(DEFAULT_POLICY).toEqual({ contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' });
  });
});
