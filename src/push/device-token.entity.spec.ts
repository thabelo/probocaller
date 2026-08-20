import { getMetadataArgsStorage } from 'typeorm';
import { DeviceToken } from './device-token.entity';

/**
 * Schema guard for the device_tokens table — the service and the migration both
 * rely on these column names, so pin them here to catch accidental drift.
 */
describe('DeviceToken entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "device_tokens" table', () => {
    const table = storage.tables.find((t) => t.target === DeviceToken);
    expect(table?.name).toBe('device_tokens');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === DeviceToken)
      .map((c) => c.propertyName);
    expect(cols).toEqual(expect.arrayContaining(['userId', 'token', 'platform']));
  });

  // A token identifies a HANDSET, not a person. Without uniqueness, a device
  // handed to another account would keep BOTH rows and push to the previous
  // owner as well — a privacy leak, not just noise.
  it('makes the token unique so it can only belong to one account at a time', () => {
    const tokenCol = storage.columns.find(
      (c) => c.target === DeviceToken && c.propertyName === 'token',
    );
    expect(tokenCol?.options?.unique).toBe(true);
  });
});
