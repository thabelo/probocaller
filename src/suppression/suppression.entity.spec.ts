import { getMetadataArgsStorage } from 'typeorm';
import { SuppressionEntry } from './suppression.entity';

/**
 * Schema guard for the suppression_entries table. We store only the keyed hash
 * of a number (never the plaintext), so pin the columns the service relies on.
 */
describe('SuppressionEntry entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "suppression_entries" table', () => {
    const table = storage.tables.find((t) => t.target === SuppressionEntry);
    expect(table?.name).toBe('suppression_entries');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === SuppressionEntry)
      .map((c) => c.propertyName);
    expect(cols).toEqual(expect.arrayContaining(['numberHash', 'reason', 'source']));
  });

  it('never stores a plaintext phone number column', () => {
    const cols = storage.columns
      .filter((c) => c.target === SuppressionEntry)
      .map((c) => c.propertyName);
    expect(cols).not.toContain('phoneNumber');
  });
});
