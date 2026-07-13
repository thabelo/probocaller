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

  it('accepts the custom personal + business dials', async () => {
    expect(await errorsFor({ personalCallPolicy: 'contacts_paid', businessCallPolicy: 'free' })).toHaveLength(0);
  });

  it('rejects an unknown personal or business policy', async () => {
    expect((await errorsFor({ personalCallPolicy: 'whatever' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ businessCallPolicy: 'sometimes' })).length).toBeGreaterThan(0);
  });
});
