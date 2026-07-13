import { getMetadataArgsStorage } from 'typeorm';
import { AirtimePayout } from './airtime.entity';

/**
 * Schema guard for the airtime_payouts table — the service and migration both
 * rely on these column names, so pin them here to catch accidental drift.
 */
describe('AirtimePayout entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "airtime_payouts" table', () => {
    const table = storage.tables.find((t) => t.target === AirtimePayout);
    expect(table?.name).toBe('airtime_payouts');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === AirtimePayout)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['userId', 'amount', 'phoneNumber', 'network', 'status', 'providerRef', 'failureReason']),
    );
  });
});
