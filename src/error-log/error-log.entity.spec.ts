import { getMetadataArgsStorage } from 'typeorm';
import { ErrorLog } from './error-log.entity';

/**
 * Schema guard for the error_logs table — the service and migration both rely
 * on these column names, so pin them here to catch accidental drift.
 */
describe('ErrorLog entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "error_logs" table', () => {
    const table = storage.tables.find((t) => t.target === ErrorLog);
    expect(table?.name).toBe('error_logs');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === ErrorLog)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['source', 'level', 'message', 'stack', 'context', 'appVersion', 'platform']),
    );
  });
});
