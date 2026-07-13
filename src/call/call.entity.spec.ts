import { getMetadataArgsStorage } from 'typeorm';
import { CallLog } from './call.entity';

const column = (name: string) =>
  getMetadataArgsStorage().columns.find((c) => c.target === CallLog && c.propertyName === name);

const relation = (name: string) =>
  getMetadataArgsStorage().relations.find((r) => r.target === CallLog && r.propertyName === name);

describe('CallLog — per-business attribution', () => {
  it('carries the business, calling number and campaign it came from (all nullable)', () => {
    for (const name of ['businessId', 'callingNumberId', 'campaignId']) {
      expect(column(name)).toBeDefined();
      expect(column(name)!.options.nullable).toBe(true);
    }
  });

  it('links to the business, and never deletes call history when the business is removed', () => {
    const rel = relation('business');
    expect(rel).toBeDefined();
    // History is preserved; the link is nulled, not cascade-deleted.
    expect((rel!.options as any).onDelete).toBe('SET NULL');
  });
});
