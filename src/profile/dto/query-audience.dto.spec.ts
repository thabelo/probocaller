import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryAudienceDto } from './query-audience.dto';

describe('QueryAudienceDto', () => {
  it('accepts date-range filters alongside field filters', () => {
    const dto = plainToInstance(QueryAudienceDto, {
      filters: { income_range: { op: 'gte', value: 'lt_5k' } },
      fromDate: '2026-01-01',
      toDate: '2026-06-30',
      budget: 5,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-string fromDate', () => {
    const dto = plainToInstance(QueryAudienceDto, { fromDate: 123 });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
