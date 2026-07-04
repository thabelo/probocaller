import { getMetadataArgsStorage } from 'typeorm';
import { Feedback } from './feedback.entity';

/**
 * Schema guard for the feedback table — the service and migration both rely on
 * these column names, so pin them here to catch accidental drift.
 */
describe('Feedback entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "feedback" table', () => {
    const table = storage.tables.find((t) => t.target === Feedback);
    expect(table?.name).toBe('feedback');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === Feedback)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['userId', 'category', 'message', 'appVersion', 'platform', 'status']),
    );
  });
});
