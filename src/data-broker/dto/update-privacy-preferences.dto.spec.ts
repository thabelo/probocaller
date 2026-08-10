import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePrivacyPreferencesDto } from './update-privacy-preferences.dto';

const errorsFor = async (obj: any) =>
  validate(plainToInstance(UpdatePrivacyPreferencesDto, obj));

describe('UpdatePrivacyPreferencesDto — call-policy fields', () => {
  it('accepts each of the six tier presets', async () => {
    for (const mode of ['all_calls', 'all_paid_biz', 'contacts_paid_biz', 'paid_all', 'contacts_only', 'dnd', 'custom']) {
      expect(await errorsFor({ callPermissionMode: mode })).toHaveLength(0);
    }
  });

  it('accepts the four custom category policies', async () => {
    expect(await errorsFor({
      contactsCallPolicy: 'free', businessCallPolicy: 'paid', newCallPolicy: 'paid', unknownCallPolicy: 'blocked',
    })).toHaveLength(0);
  });

  it('accepts a list of named custom rules plus a selection id', async () => {
    expect(await errorsFor({
      customCallRules: [
        { id: 'r1', name: 'Work hours', contacts: 'free', business: 'blocked', newCaller: 'free', unknown: 'free' },
        { id: 'r2', name: 'Strict', contacts: 'paid', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' },
      ],
      selectedCustomRuleId: 'r2',
    })).toHaveLength(0);
  });

  it('accepts clearing the selection with an empty id', async () => {
    expect(await errorsFor({ selectedCustomRuleId: '' })).toHaveLength(0);
  });

  it('rejects a non-array customCallRules', async () => {
    expect((await errorsFor({ customCallRules: 'Work hours' })).length).toBeGreaterThan(0);
  });

  it('rejects a rule with an invalid category policy', async () => {
    expect((await errorsFor({
      customCallRules: [{ id: 'r1', name: 'Bad', contacts: 'sometimes', business: 'paid', newCaller: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
  });

  it('rejects a rule missing its id or name', async () => {
    expect((await errorsFor({
      customCallRules: [{ name: 'No id', contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
    expect((await errorsFor({
      customCallRules: [{ id: 'r1', contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
  });

  it('rejects an unknown category policy value', async () => {
    expect((await errorsFor({ contactsCallPolicy: 'whatever' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ newCallPolicy: 'sometimes' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ unknownCallPolicy: 'maybe' })).length).toBeGreaterThan(0);
  });
});

// Independent, sibling validation for SMS-policy fields — no legacy aliases,
// no shared shape with the call-policy fields above.
describe('UpdatePrivacyPreferencesDto — SMS-policy fields', () => {
  it('accepts each of the six SMS tier presets', async () => {
    for (const mode of ['all_messages', 'all_paid_biz', 'contacts_paid_biz', 'paid_all', 'contacts_only', 'dnd', 'custom']) {
      expect(await errorsFor({ smsPermissionMode: mode })).toHaveLength(0);
    }
  });

  it('rejects a legacy call-mode alias for smsPermissionMode (no legacy SMS aliases)', async () => {
    expect((await errorsFor({ smsPermissionMode: 'everyone' })).length).toBeGreaterThan(0);
  });

  it('accepts the four custom SMS category policies', async () => {
    expect(await errorsFor({
      contactsSmsPolicy: 'free', businessSmsPolicy: 'paid', newSmsPolicy: 'paid', unknownSmsPolicy: 'blocked',
    })).toHaveLength(0);
  });

  it('accepts a list of named custom SMS rules plus a selection id', async () => {
    expect(await errorsFor({
      customSmsRules: [
        { id: 'r1', name: 'Work hours', contacts: 'free', business: 'blocked', newSender: 'free', unknown: 'free' },
        { id: 'r2', name: 'Strict', contacts: 'paid', business: 'blocked', newSender: 'blocked', unknown: 'blocked' },
      ],
      selectedCustomSmsRuleId: 'r2',
    })).toHaveLength(0);
  });

  it('accepts clearing the SMS selection with an empty id', async () => {
    expect(await errorsFor({ selectedCustomSmsRuleId: '' })).toHaveLength(0);
  });

  it('rejects a non-array customSmsRules', async () => {
    expect((await errorsFor({ customSmsRules: 'Work hours' })).length).toBeGreaterThan(0);
  });

  it('rejects an SMS rule with an invalid category policy', async () => {
    expect((await errorsFor({
      customSmsRules: [{ id: 'r1', name: 'Bad', contacts: 'sometimes', business: 'paid', newSender: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
  });

  it('rejects an SMS rule missing its id or name', async () => {
    expect((await errorsFor({
      customSmsRules: [{ name: 'No id', contacts: 'free', business: 'paid', newSender: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
    expect((await errorsFor({
      customSmsRules: [{ id: 'r1', contacts: 'free', business: 'paid', newSender: 'free', unknown: 'free' }],
    })).length).toBeGreaterThan(0);
  });

  it('rejects an unknown SMS category policy value', async () => {
    expect((await errorsFor({ contactsSmsPolicy: 'whatever' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ newSmsPolicy: 'sometimes' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ unknownSmsPolicy: 'maybe' })).length).toBeGreaterThan(0);
  });
});
