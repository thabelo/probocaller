import { getMetadataArgsStorage } from 'typeorm';
import { UserConsent } from './user-consent.entity';

describe('UserConsent entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "user_consents" table', () => {
    const table = storage.tables.find((t) => t.target === UserConsent);
    expect(table?.name).toBe('user_consents');
  });

  it('declares the columns the service relies on', () => {
    const cols = storage.columns
      .filter((c) => c.target === UserConsent)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['userId', 'consentType', 'version', 'grantedAt', 'revokedAt']),
    );
  });
});
