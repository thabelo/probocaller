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

  it('accepts a callRuleNames map', async () => {
    expect(await errorsFor({ newCallPolicy: 'blocked', callRuleNames: { newCaller: 'No strangers' } })).toHaveLength(0);
  });

  it('rejects an unknown category policy value', async () => {
    expect((await errorsFor({ contactsCallPolicy: 'whatever' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ newCallPolicy: 'sometimes' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ unknownCallPolicy: 'maybe' })).length).toBeGreaterThan(0);
  });
});
