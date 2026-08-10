import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuerySmsLogsDto } from './query-sms-logs.dto';

/**
 * Query params for the cross-user admin SMS-logs endpoint. Everything is
 * optional; page/limit are coerced from their string query-string form to
 * bounded integers, and the enum-ish fields reject anything off-list.
 */
describe('QuerySmsLogsDto', () => {
  const build = (obj: any) => plainToInstance(QuerySmsLogsDto, obj);

  it('accepts an empty query (all fields optional) and defaults page/limit', () => {
    const dto = build({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('coerces page/limit/userId from strings to numbers', async () => {
    const dto = build({ page: '3', limit: '20', userId: '42' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(20);
    expect(dto.userId).toBe(42);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a decision that is not free/paid/blocked', async () => {
    const errors = await validate(build({ decision: 'nope' }));
    expect(errors.some((e) => e.property === 'decision')).toBe(true);
  });

  it('rejects a category that is not one of the four buckets', async () => {
    const errors = await validate(build({ category: 'spam' }));
    expect(errors.some((e) => e.property === 'category')).toBe(true);
  });

  it('rejects page below 1 and limit above 200', async () => {
    const errors = await validate(build({ page: '0', limit: '500' }));
    expect(errors.some((e) => e.property === 'page')).toBe(true);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('accepts an optional keyword string', async () => {
    const dto = build({ keyword: 'otp' });
    expect(dto.keyword).toBe('otp');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-string keyword', async () => {
    const errors = await validate(build({ keyword: 123 }));
    expect(errors.some((e) => e.property === 'keyword')).toBe(true);
  });

  it('accepts a fully-specified valid query', async () => {
    const dto = build({
      from: '2026-01-01',
      to: '2026-01-31',
      decision: 'blocked',
      category: 'newSender',
      address: '0821',
      keyword: 'otp',
      userId: '7',
      page: '2',
      limit: '100',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
