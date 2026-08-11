import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SmsLogService } from './sms-log.service';
import { SmsLog } from './sms-log.entity';
import { Business } from '../business/business.entity';
import { User } from '../user/user.entity';
import { BusinessService } from '../business/business.service';
import { ReferralService } from '../referral/referral.service';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * Per-user SMS activity log. `create` never receives or stores message
 * content — only the device-computed hash, sender address, and the policy
 * category/decision that was applied.
 */
describe('SmsLogService', () => {
  let service: SmsLogService;
  let repo: any;
  let businessService: { resolveCallerIdentity: jest.Mock };
  let referralService: { payCommission: jest.Mock };
  let transactionService: { log: jest.Mock };
  let settingsReader: { getNumber: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, createdAt: new Date(), ...data })),
      find: jest.fn(),
    };
    businessService = { resolveCallerIdentity: jest.fn().mockResolvedValue(null) };
    referralService = { payCommission: jest.fn().mockResolvedValue(undefined) };
    transactionService = { log: jest.fn().mockResolvedValue(undefined) };
    settingsReader = { getNumber: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsLogService,
        { provide: getRepositoryToken(SmsLog), useValue: repo },
        { provide: BusinessService, useValue: businessService },
        { provide: ReferralService, useValue: referralService },
        { provide: TransactionService, useValue: transactionService },
        { provide: SettingsReaderService, useValue: settingsReader },
        { provide: DataSource, useValue: dataSource },
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
        category: 'contacts',
        decision: 'free',
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
    // Filtering/stats never bill, so the billing dependencies are irrelevant here.
    service = new SmsLogService(repo, {} as any, {} as any, {} as any, {} as any, {} as any);

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

    it('groups byKeyword desc, excluding null/empty matches', async () => {
      await seed([
        { userId: 3, address: S1, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T10:00:00Z') },
        { userId: 3, address: S2, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T11:00:00Z') },
        { userId: 3, address: S3, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T12:00:00Z') },
        { userId: 3, address: S1, category: 'newSender', decision: 'blocked', matchedKeyword: 'bank', createdAt: new Date('2026-01-04T13:00:00Z') },
        { userId: 3, address: S2, category: 'newSender', decision: 'blocked', matchedKeyword: 'bank', createdAt: new Date('2026-01-04T14:00:00Z') },
        { userId: 3, address: S3, category: 'newSender', decision: 'blocked', matchedKeyword: 'prize', createdAt: new Date('2026-01-04T15:00:00Z') },
      ]);

      const { byKeyword } = await service.statsFor({} as any);
      // The 5 original rows have a null matchedKeyword and must be excluded.
      expect(byKeyword).toEqual([
        { keyword: 'otp', count: 3 },
        { keyword: 'bank', count: 2 },
        { keyword: 'prize', count: 1 },
      ]);
    });

    it('byKeyword respects an active filter (only counts matching rows)', async () => {
      await seed([
        { userId: 3, address: S1, category: 'newSender', decision: 'blocked', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T10:00:00Z') },
        { userId: 3, address: S2, category: 'business', decision: 'paid', matchedKeyword: 'otp', createdAt: new Date('2026-01-04T11:00:00Z') },
      ]);

      const { byKeyword } = await service.statsFor({ category: 'newSender' } as any);
      expect(byKeyword).toEqual([{ keyword: 'otp', count: 1 }]);
    });
  });
});

/**
 * SMS billing — mirrors CallService.completeCall's business-call money move
 * exactly: the business (sender) pays, the receiving user earns, the
 * platform takes its cut, and the receiver's referrer (if any) is paid a
 * lifetime commission on the platform's own cut. Billing only ever applies
 * to category:'business' + decision:'paid' — every other combination just
 * logs the row with no money movement.
 */
describe('SmsLogService — SMS billing (business, paid)', () => {
  let service: SmsLogService;
  let repo: any;
  let businessService: { resolveCallerIdentity: jest.Mock };
  let referralService: { payCommission: jest.Mock };
  let transactionService: { log: jest.Mock };
  let settingsReader: { getNumber: jest.Mock };
  let manager: any;
  let dataSource: { transaction: jest.Mock };

  const dto = (overrides = {}) => ({
    address: '+27821234567',
    bodyHash: 'a'.repeat(32),
    category: 'business',
    decision: 'paid',
    ...overrides,
  } as any);

  const identity = { isBusiness: true, businessId: 4 };

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, createdAt: new Date(), ...data })),
    };
    businessService = { resolveCallerIdentity: jest.fn().mockResolvedValue(identity) };
    referralService = { payCommission: jest.fn().mockResolvedValue(undefined) };
    transactionService = { log: jest.fn().mockResolvedValue(undefined) };
    settingsReader = {
      getNumber: jest.fn(async (key: string) => {
        if (key === 'SMS_RATE_PER_MESSAGE') return 0.05;
        if (key === 'PLATFORM_CUT_RATE') return 0.24;
        throw new Error(`unexpected setting key in test: ${key}`);
      }),
    };
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (_e: any, x: any) => x),
      create: jest.fn((_e: any, data: any) => data),
    };
    dataSource = { transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsLogService,
        { provide: getRepositoryToken(SmsLog), useValue: repo },
        { provide: BusinessService, useValue: businessService },
        { provide: ReferralService, useValue: referralService },
        { provide: TransactionService, useValue: transactionService },
        { provide: SettingsReaderService, useValue: settingsReader },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = mod.get(SmsLogService);
  });

  const wireEntities = (business: any, owner: any, receiver: any) => {
    manager.findOne.mockImplementation(async (entity: any, opts: any) => {
      if (entity === Business) return business;
      if (entity === User) return opts.where.id === owner.id ? owner : opts.where.id === receiver.id ? receiver : null;
      return null;
    });
  };

  it('charges the business owner, credits the receiver, and pays the referral commission', async () => {
    const business = { id: 4, userId: 20, companyName: 'Acme' };
    const owner = { id: 20, walletBalance: 100 };
    const receiver = { id: 42, walletBalance: 0, referredBy: 7 };
    wireEntities(business, owner, receiver);

    const log = await service.create(42, dto());

    // businessCost = 0.05, platformCut = 0.012, userEarnings = 0.038
    expect(owner.walletBalance).toBeCloseTo(99.95, 6);
    expect(receiver.walletBalance).toBeCloseTo(0.038, 6);
    expect(transactionService.log).toHaveBeenCalledWith(
      20, 'SMS_CHARGE', -0.05, expect.any(String), undefined, manager, 4,
    );
    expect(transactionService.log).toHaveBeenCalledWith(
      42, 'SMS_EARN', expect.closeTo(0.038, 6), expect.any(String), undefined, manager, 4,
    );
    expect(referralService.payCommission).toHaveBeenCalledWith(42, expect.closeTo(0.012, 6), manager);
    expect(log.userId).toBe(42);
  });

  it('the CHARGE ledger description is in ZAR (R…), not dollars', async () => {
    const business = { id: 4, userId: 20, companyName: 'Acme' };
    const owner = { id: 20, walletBalance: 100 };
    const receiver = { id: 42, walletBalance: 0 };
    wireEntities(business, owner, receiver);

    await service.create(42, dto());

    const charge = transactionService.log.mock.calls.find((c: any[]) => c[1] === 'SMS_CHARGE');
    expect(charge[3]).toContain('R');
    expect(charge[3]).not.toContain('$');
  });

  it('floors the charge at the owner’s available balance (never goes negative)', async () => {
    const business = { id: 4, userId: 20, companyName: 'Acme' };
    const owner = { id: 20, walletBalance: 0.01 }; // less than the 0.05 SMS rate
    const receiver = { id: 42, walletBalance: 0 };
    wireEntities(business, owner, receiver);

    await service.create(42, dto());

    expect(owner.walletBalance).toBe(0); // charged only what was available
    // platformCut = 0.01 * 0.24 = 0.0024, userEarnings = 0.0076
    expect(receiver.walletBalance).toBeCloseTo(0.0076, 6);
  });

  it('does NOT move money for a business SMS that is not decision:paid', async () => {
    const log = await service.create(42, dto({ decision: 'free' }));

    expect(businessService.resolveCallerIdentity).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(transactionService.log).not.toHaveBeenCalled();
    expect(log.userId).toBe(42);
  });

  it('does NOT move money for a paid SMS whose category is not business', async () => {
    const log = await service.create(42, dto({ category: 'newSender' }));

    expect(businessService.resolveCallerIdentity).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(transactionService.log).not.toHaveBeenCalled();
    expect(log.userId).toBe(42);
  });

  it('logs the row with no billing when the sender does not resolve to a business (defensive)', async () => {
    businessService.resolveCallerIdentity.mockResolvedValue(null);

    const log = await service.create(42, dto());

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(transactionService.log).not.toHaveBeenCalled();
    expect(log.userId).toBe(42);
    expect(log.category).toBe('business');
  });

  it('still creates the SmsLog row when billing succeeds', async () => {
    const business = { id: 4, userId: 20, companyName: 'Acme' };
    const owner = { id: 20, walletBalance: 100 };
    const receiver = { id: 42, walletBalance: 0 };
    wireEntities(business, owner, receiver);

    const log = await service.create(42, dto());

    expect(log.userId).toBe(42);
    expect(log.address).toBe('+27821234567');
    expect(log.category).toBe('business');
    expect(log.decision).toBe('paid');
  });
});
