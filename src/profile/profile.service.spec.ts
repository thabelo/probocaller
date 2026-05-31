import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileField } from './profile-field.entity';
import { UserProfile } from './user-profile.entity';
import { DataAccessLog } from './data-access-log.entity';
import { BusinessAudience } from './business-audience.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Transaction } from '../transaction/transaction.entity';
import { DataSource } from 'typeorm';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

const mockField = (overrides = {}): ProfileField =>
  ({ id: 1, key: 'income_range', label: 'Monthly Income Range', type: 'select', creditCost: 0.05, weight: 10, enabled: true, sortOrder: 0, options: [], ...overrides } as ProfileField);

const mockProfile = (overrides = {}): UserProfile =>
  ({ id: 1, userId: 1, data: {}, tier: 'basic', completionScore: 0, ...overrides } as UserProfile);

describe('ProfileService', () => {
  let service: ProfileService;
  let fieldRepo: ReturnType<typeof mockRepo>;
  let profileRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(ProfileField), useFactory: mockRepo },
        { provide: getRepositoryToken(UserProfile), useFactory: mockRepo },
        { provide: getRepositoryToken(DataAccessLog), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessAudience), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(Transaction), useFactory: mockRepo },
        // DataSource is required by purchaseLeads' transaction wrapper. Other
        // tests don't exercise it; a no-op stub keeps DI satisfied.
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProfileService);
    fieldRepo = module.get(getRepositoryToken(ProfileField));
    profileRepo = module.get(getRepositoryToken(UserProfile));
  });

  describe('getEnabledFields', () => {
    it('returns only enabled fields ordered by sortOrder', async () => {
      const fields = [mockField()];
      fieldRepo.find.mockResolvedValue(fields);
      const result = await service.getEnabledFields();
      expect(result).toHaveLength(1);
      expect(fieldRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { enabled: true } }));
    });
  });

  describe('getMyProfile', () => {
    it('throws NotFoundException when user has no profile', async () => {
      fieldRepo.find.mockResolvedValue([mockField()]);
      profileRepo.findOne.mockResolvedValue(null);
      profileRepo.create.mockReturnValue(mockProfile());
      profileRepo.save.mockResolvedValue(mockProfile());
      // should create a new profile, not throw
      const result = await service.getMyProfile(99);
      expect(result).toBeDefined();
    });
  });

  describe('purchaseLeads — cost math hardening (H7)', () => {
    // The old code computed maxAffordable as
    //   Math.floor(budget / sum || matches.length)
    // …which has two bad cases:
    //   - budget=0 → `0 || matches.length` → maxAffordable = matches.length
    //     → the business gets every match charged at full price.
    //   - sum=0 (no requested-key has a creditCost) or requestedKeys=[]
    //     → `budget / 0 = Infinity` → Math.floor(Infinity) → buys every match,
    //     potentially overspending and bypassing the business's intent.
    // These tests pin the corrected behaviour.

    const businessRepo = () => (module as any).get(getRepositoryToken(Business));
    const userRepo     = () => (module as any).get(getRepositoryToken(User));
    const dataSource   = () => (module as any).get(DataSource);
    let module: TestingModule;
    let managerSpy: any;

    beforeEach(async () => {
      // Mock the DataSource to invoke the txn callback with a spy-able manager.
      managerSpy = {
        findOne: jest.fn(),
        save:    jest.fn(async (_e: any, x: any) => x),
        create:  jest.fn((_e: any, data: any) => ({ ...data })),
      };
      const dsMock = {
        transaction: jest.fn(async (cb: any) => cb(managerSpy)),
      };

      module = await Test.createTestingModule({
        providers: [
          ProfileService,
          { provide: getRepositoryToken(ProfileField),    useFactory: mockRepo },
          { provide: getRepositoryToken(UserProfile),     useFactory: mockRepo },
          { provide: getRepositoryToken(DataAccessLog),   useFactory: mockRepo },
          { provide: getRepositoryToken(BusinessAudience), useFactory: mockRepo },
          { provide: getRepositoryToken(User),            useFactory: mockRepo },
          { provide: getRepositoryToken(Business),        useFactory: mockRepo },
          { provide: getRepositoryToken(Transaction),     useFactory: mockRepo },
          { provide: DataSource,                          useValue: dsMock },
        ],
      }).compile();
      service = module.get(ProfileService);
      fieldRepo   = module.get(getRepositoryToken(ProfileField));
      profileRepo = module.get(getRepositoryToken(UserProfile));
    });

    const wireMatches = (budget: number | undefined, fieldCost: number, matchCount: number, callerBalance = 1_000_000) => {
      businessRepo().findOne.mockResolvedValue({ id: 1, userId: 7, companyName: 'AcmeCo' });
      fieldRepo.find.mockResolvedValue([mockField({ key: 'income_range', creditCost: fieldCost })]);
      const profiles = Array.from({ length: matchCount }, (_, i) =>
        mockProfile({ id: i + 1, userId: 100 + i, data: { income_range: 'gt_20k' } }));
      profileRepo.find.mockResolvedValue(profiles);
      // The pre-txn lookups (caller existence check, etc.) still go through
      // userRepo.findOne; the wallet-mutating reads go through manager.findOne
      // inside the transaction.
      userRepo().findOne.mockImplementation(async ({ where }: any) =>
        where.id === 7
          ? { id: 7, walletBalance: callerBalance }
          : { id: where.id, walletBalance: 0, dataShareEnabled: true, dataCategories: ['income_range'] });
      managerSpy.findOne.mockImplementation(async (_entity: any, opts: any) =>
        opts.where.id === 7
          ? { id: 7, walletBalance: callerBalance }
          : { id: opts.where.id, walletBalance: 0, dataShareEnabled: true, dataCategories: ['income_range'] });
      return budget;
    };

    it('budget=0 buys zero leads (was: bought every match)', async () => {
      const budget = wireMatches(0, 0.05, 10);
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget });
      expect(result.purchased).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('budget < cost of one lead buys zero leads', async () => {
      const budget = wireMatches(1, 5, 10); // 1 / 5 = 0.2 → floor = 0
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget });
      expect(result.purchased).toBe(0);
    });

    it('budget = 2 × cost buys exactly 2 leads', async () => {
      const budget = wireMatches(10, 5, 10);
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget });
      expect(result.purchased).toBe(2);
    });

    it('costPerUser=0 (no field cost configured) buys all matches but charges 0 (was: Math.floor(Infinity) → "buys" Infinity)', async () => {
      const budget = wireMatches(100, 0, 5);
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget });
      expect(result.purchased).toBe(5);
      expect(result.totalCost).toBe(0);
    });

    it('omitted budget buys all matches (existing intentional behaviour preserved)', async () => {
      wireMatches(undefined, 1, 3);
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } } });
      expect(result.purchased).toBe(3);
    });

    it('incognito caller: writes no DataAccessLog, but the user still earns', async () => {
      wireMatches(100, 5, 1);
      // Caller (id 7) is incognito.
      managerSpy.findOne.mockImplementation(async (_e: any, opts: any) =>
        opts.where.id === 7
          ? { id: 7, walletBalance: 1_000_000, incognitoEnabled: true }
          : { id: opts.where.id, walletBalance: 0, dataShareEnabled: true, dataCategories: ['income_range'] });

      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100 });
      expect(result.purchased).toBe(1);

      const savedEntityClasses = managerSpy.save.mock.calls.map((c: any[]) => c[0]);
      expect(savedEntityClasses).not.toContain(DataAccessLog); // viewer not attributed

      const earnTx = managerSpy.save.mock.calls
        .filter((c: any[]) => c[0] === Transaction)
        .map((c: any[]) => c[1]);
      expect(earnTx.some((t: any) => t.type === 'DATA_EARN')).toBe(true); // user still paid
    });

    it('non-incognito caller: writes a DataAccessLog (default transparency)', async () => {
      wireMatches(100, 5, 1);
      await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100 });
      const savedEntityClasses = managerSpy.save.mock.calls.map((c: any[]) => c[0]);
      expect(savedEntityClasses).toContain(DataAccessLog);
    });

    it('Backend H6 — locks the caller wallet row with pessimistic_write inside the txn (prevents concurrent over-spend)', async () => {
      wireMatches(100, 1, 3);
      await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100 });

      // The caller must have been re-read inside the txn with a write lock.
      const callerCall = managerSpy.findOne.mock.calls.find(
        ([_e, opts]: any) => opts?.where?.id === 7,
      );
      expect(callerCall).toBeTruthy();
      const [, opts] = callerCall;
      expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
      // And the whole purchase must have run inside dataSource.transaction(...).
      expect(dataSource().transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMyProfile — full replace behaviour', () => {
    it('replaces data entirely (does not merge with old data)', async () => {
      const existing = mockProfile({ data: { income_range: 'lt_5k', marital_status: 'single' } });
      fieldRepo.find.mockResolvedValue([mockField()]);
      profileRepo.findOne.mockResolvedValue(existing);
      profileRepo.save.mockImplementation((p: UserProfile) => Promise.resolve(p));

      // Only send income_range — marital_status should be dropped
      await service.updateMyProfile(1, { data: { income_range: 'gt_20k' } });

      const savedProfile = profileRepo.save.mock.calls[0][0] as UserProfile;
      expect(savedProfile.data.income_range).toBe('gt_20k');
      expect(savedProfile.data.marital_status).toBeUndefined();
    });
  });
});
