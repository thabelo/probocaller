import { getMetadataArgsStorage } from 'typeorm';
import { ReverseLookupEvent } from './reverse-lookup-event.entity';

const column = (name: string) =>
  getMetadataArgsStorage().columns.find(
    (c) => c.target === ReverseLookupEvent && c.propertyName === name,
  );

describe('ReverseLookupEvent entity', () => {
  it('maps to the reverse_lookup_events table', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === ReverseLookupEvent);
    expect(table?.name).toBe('reverse_lookup_events');
  });

  it('records the number, provider, cost and whether it was a cached (free) hit', () => {
    expect(column('phoneNumber')).toBeDefined();
    expect(column('provider')?.options.default).toBe('google');
    expect(column('cached')?.options.default).toBe(false);
    expect(column('lineType')?.options.nullable).toBe(true);
    expect(column('hasName')?.options.default).toBe(false);
    expect(column('costUsd')?.options.type).toBe('decimal');
  });
});
