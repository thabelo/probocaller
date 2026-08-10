import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SmsLogService } from './sms-log.service';
import { SmsLog } from './sms-log.entity';

/**
 * Per-user SMS activity log. `create` never receives or stores message
 * content — only the device-computed hash, sender address, and the policy
 * category/decision that was applied.
 */
describe('SmsLogService', () => {
  let service: SmsLogService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, createdAt: new Date(), ...data })),
      find: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsLogService,
        { provide: getRepositoryToken(SmsLog), useValue: repo },
      ],
    }).compile();
    service = mod.get(SmsLogService);
  });

  describe('create', () => {
    it('normalises the address before storing', async () => {
      const dto = {
        address: '072 123 4567',
        bodyHash: 'a'.repeat(32),
        category: 'contacts',
        decision: 'free',
      } as any;

      const log = await service.create(42, dto);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        userId: 42,
        address: '+27721234567',
        bodyHash: 'a'.repeat(32),
        category: 'contacts',
        decision: 'free',
      }));
      expect(log.userId).toBe(42);
      expect(log.address).toBe('+27721234567');
    });

    it('does not normalise the bodyHash (it is opaque, not a phone number)', async () => {
      const dto = {
        address: '+27821234567',
        bodyHash: 'b'.repeat(32),
        category: 'business',
        decision: 'paid',
      } as any;

      const log = await service.create(1, dto);

      expect(log.bodyHash).toBe('b'.repeat(32));
    });

    it('persists the matched scam keyword when the dto supplies one', async () => {
      const dto = {
        address: '+27821234567',
        bodyHash: 'c'.repeat(32),
        category: 'newSender',
        decision: 'blocked',
        matchedKeyword: 'otp',
      } as any;

      const log = await service.create(1, dto);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ matchedKeyword: 'otp' }),
      );
      expect(log.matchedKeyword).toBe('otp');
    });

    it('stores matchedKeyword as null when the dto omits it', async () => {
      const dto = {
        address: '+27821234567',
        bodyHash: 'd'.repeat(32),
        category: 'contacts',
        decision: 'free',
      } as any;

      const log = await service.create(1, dto);

      expect(log.matchedKeyword).toBeNull();
    });
  });

  describe('findAllForUser', () => {
    it('returns only the given user\'s rows, newest first', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAllForUser(42);

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 42 },
        order: { createdAt: 'DESC' },
      });
    });
  });
});

/**
 * Cross-user admin querying: filtering, pagination and aggregate stats over the
 * whole sms_logs table (not a single user). Backed by a real in-memory sqlite
 * DataSource so the query-builder where/skip/take and the stats reduction run
 * against actual rows, not a mock.
 */
describe('SmsLogService (admin filtered / stats)', () => {
  let ds: DataSource;
  let repo: Repository<SmsLog>;
  let service: SmsLogService;

  // Sender addresses reused across rows so topSenders / address search have
  // something to aggregate.
  const S1 = '+27820000001';
  const S2 = '+27820000002';
  const S3 = '+27820000003';

  const seed = async (rows: Array<Partial<SmsLog>>) => {
    for (const r of rows) {
      await repo.save(
        repo.create({
          bodyHash: 'a'.repeat(32),
          ...r,
        } as SmsLog),
      );
    }
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SmsLog],
      synchronize: true,
    });
    await ds.initialize();
    repo = ds.getRepository(SmsLog);
    service = new SmsLogService(repo);

    // 5 rows, 3 users' worth of senders, spread across 3 UTC days.
    await seed([
      { userId: 1, address: S1, category: 'contacts', decision: 'free', createdAt: new Date('2026-01-01T10:00:00Z') }, // A
      { userId: 1, address: S2, category: 'business', decision: 'paid', createdAt: new Date('2026-01-01T12:00:00Z') }, // B
      { userId: 2, address: S3, category: 'newSender', decision: 'blocked', createdAt: new Date('2026-01-02T09:00:00Z') }, // C
      { userId: 2, address: S1, category: 'unknown', decision: 'blocked', createdAt: new Date('2026-01-03T08:00:00Z') }, // D
      { userId: 1, address: S1, category: 'contacts', decision: 'free', createdAt: new Date('2026-01-03T20:00:00Z') }, // E
    ]);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  describe('findFiltered', () => {
    it('returns every row newest-first with a total when unfiltered', async () => {
      const { data, total } = await service.findFiltered({} as any);
      expect(total).toBe(5);
      expect(data.map((r) => r.createdAt.toISOString())).toEqual([
        '2026-01-03T20:00:00.000Z', // E
        '2026-01-03T08:00:00.000Z', // D
        '2026-01-02T09:00:00.000Z', // C
        '2026-01-01T12:00:00.000Z', // B
        '2026-01-01T10:00:00.000Z', // A
      ]);
    });

    it('filters by decision', async () => {
      const { data, total } = await service.findFiltered({ decision: 'blocked' } as any);
      expect(total).toBe(2);
      expect(data.every((r) => r.decision === 'blocked')).toBe(true);
    });

    it('filters by category', async () => {
      const { total } = await service.findFiltered({ category: 'contacts' } as any);
      expect(total).toBe(2);
    });

    it('filters by userId when given (cross-user otherwise)', async () => {
      const { data, total } = await service.findFiltered({ userId: 1 } as any);
      expect(total).toBe(3);
      expect(data.every((r) => r.userId === 1)).toBe(true);
    });

    it('searches address by case-insensitive substring', async () => {
      const { total } = await service.findFiltered({ address: '0000001' } as any);
      expect(total).toBe(3); // A, D, E all sent from S1
    });

    it('filters createdAt by an inclusive date range (date-only to end of day)', async () => {
      const { data, total } = await service.findFiltered({ from: '2026-01-01', to: '2026-01-02' } as any);
      expect(total).toBe(3); // A, B (Jan 1) and C (Jan 2); D & E on Jan 3 excluded
      expect(data.every((r) => r.createdAt < new Date('2026-01-03T00:00:00Z'))).toBe(true);
    });

    it('filters by matched scam keyword (exact match)', async () => {
      await seed([
        { userId: 3, address: S1, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T10:00:00Z') },
        { userId: 3, address: S2, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T11:00:00Z') },
        { userId: 3, address: S3, category: 'newSender', decision: 'blocked', matchedKeyword: 'bank', createdAt: new Date('2026-01-04T12:00:00Z') },
      ]);

      const { data, total } = await service.findFiltered({ keyword: 'otp' } as any);
      expect(total).toBe(2);
      expect(data.every((r) => r.matchedKeyword === 'otp')).toBe(true);
    });

    it('paginates: page slice differs from total', async () => {
      const p1 = await service.findFiltered({ page: 1, limit: 2 } as any);
      expect(p1.total).toBe(5);
      expect(p1.data.map((r) => r.createdAt.toISOString())).toEqual([
        '2026-01-03T20:00:00.000Z', // E
        '2026-01-03T08:00:00.000Z', // D
      ]);
      const p2 = await service.findFiltered({ page: 2, limit: 2 } as any);
      expect(p2.total).toBe(5);
      expect(p2.data.map((r) => r.createdAt.toISOString())).toEqual([
        '2026-01-02T09:00:00.000Z', // C
        '2026-01-01T12:00:00.000Z', // B
      ]);
    });
  });

  describe('statsFor', () => {
    it('counts by decision with all keys present (zeros included)', async () => {
      const { byDecision } = await service.statsFor({ category: 'contacts' } as any);
      // Only A & E match (both free) — paid/blocked still reported as 0.
      expect(byDecision).toEqual({ free: 2, paid: 0, blocked: 0 });
    });

    it('counts by category with all four buckets present (zeros included)', async () => {
      const { byCategory } = await service.statsFor({ decision: 'free' } as any);
      expect(byCategory).toEqual({ contacts: 2, business: 0, newSender: 0, unknown: 0 });
    });

    it('reflects the whole filtered set, not just one page (ignores page/limit)', async () => {
      const { byDecision } = await service.statsFor({ page: 1, limit: 1 } as any);
      expect(byDecision).toEqual({ free: 2, paid: 1, blocked: 2 });
    });

    it('buckets overTime by UTC calendar day, ascending, with per-decision counts', async () => {
      const { overTime } = await service.statsFor({} as any);
      expect(overTime).toEqual([
        { date: '2026-01-01', blocked: 0, paid: 1, free: 1 }, // A free, B paid
        { date: '2026-01-02', blocked: 1, paid: 0, free: 0 }, // C blocked
        { date: '2026-01-03', blocked: 1, paid: 0, free: 1 }, // D blocked, E free
      ]);
    });

    it('counts only rows matching the keyword filter', async () => {
      await seed([
        { userId: 3, address: S1, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T10:00:00Z') },
        { userId: 3, address: S2, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T11:00:00Z') },
        { userId: 3, address: S3, category: 'newSender', decision: 'blocked', matchedKeyword: 'bank', createdAt: new Date('2026-01-04T12:00:00Z') },
      ]);

      const { byDecision } = await service.statsFor({ keyword: 'otp' } as any);
      expect(byDecision).toEqual({ free: 0, paid: 0, blocked: 2 });
    });

    it('ranks topSenders by total count with a blocked sub-count', async () => {
      const { topSenders } = await service.statsFor({} as any);
      expect(topSenders[0]).toEqual({ address: S1, count: 3, blocked: 1 }); // A, D(blocked), E
      expect(topSenders.map((s) => s.count)).toEqual([3, 1, 1]);
      expect(topSenders.find((s) => s.address === S3)).toEqual({ address: S3, count: 1, blocked: 1 });
    });
  });
});
