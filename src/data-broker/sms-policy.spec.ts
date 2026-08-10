import {
  SMS_PRESETS,
  presetForSms,
  policyForSmsPreset,
  DEFAULT_SMS_POLICY,
} from './sms-policy';

describe('sms-policy — four sender categories', () => {
  it('defines the six presets over the four categories', () => {
    expect(SMS_PRESETS.all_messages).toEqual({ contacts: 'free', business: 'free', newSender: 'free', unknown: 'free' });
    expect(SMS_PRESETS.all_paid_biz).toEqual({ contacts: 'free', business: 'paid', newSender: 'free', unknown: 'free' });
    expect(SMS_PRESETS.contacts_paid_biz).toEqual({ contacts: 'free', business: 'paid', newSender: 'blocked', unknown: 'blocked' });
    expect(SMS_PRESETS.paid_all).toEqual({ contacts: 'free', business: 'paid', newSender: 'paid', unknown: 'paid' });
    expect(SMS_PRESETS.contacts_only).toEqual({ contacts: 'free', business: 'blocked', newSender: 'blocked', unknown: 'blocked' });
    expect(SMS_PRESETS.dnd).toEqual({ contacts: 'blocked', business: 'blocked', newSender: 'blocked', unknown: 'blocked' });
  });

  it('round-trips preset <-> policy, custom for off-preset', () => {
    expect(policyForSmsPreset('all_paid_biz')).toEqual(SMS_PRESETS.all_paid_biz);
    expect(presetForSms(SMS_PRESETS.contacts_paid_biz)).toBe('contacts_paid_biz');
    expect(presetForSms({ contacts: 'free', business: 'paid', newSender: 'paid', unknown: 'blocked' })).toBe('custom');
    expect(policyForSmsPreset('nope')).toBeNull();
  });

  it('DEFAULT_SMS_POLICY keeps everyone reachable with paid business', () => {
    expect(DEFAULT_SMS_POLICY).toEqual({ contacts: 'free', business: 'paid', newSender: 'free', unknown: 'free' });
  });
});
