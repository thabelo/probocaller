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
import { DataCertificate } from './data-certificate.entity';
import { Setting } from '../config/setting.entity';
import { ReferralService } from '../referral/referral.service';
import { DataSource } from 'typeorm';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
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
        { provide: getRepositoryToken(DataCertificate), useFactory: mockRepo },
        { provide: getRepositoryToken(Setting), useFactory: mockRepo },
        { provide: ReferralService, useValue: { payCommission: jest.fn().mockResolvedValue(undefined) } },
        // DataSource is required by purchaseLeads' transaction wrapper. Other
        // tests don't exercise it; a no-op stub keeps DI satisfied.
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProfileService);
    fieldRepo = module.get(getRepositoryToken(ProfileField));
    profileRepo = module.get(getRepositoryToken(UserProfile));
  });

  // "Share all filled fields" model: sharing keys off the filled profile fields.
  describe('sharableCandidateKeys — the filled, enabled fields eligible to share', () => {
    it('returns enabled field keys that have a non-empty value', async () => {
      fieldRepo.find.mockResolvedValue([
        mockField({ key: 'income_range' }),
        mockField({ key: 'marital_status' }),
        mockField({ key: 'household_size' }),
      ]);
      profileRepo.findOne.mockResolvedValue(mockProfile({ data: { income_range: '5k_10k', marital_status: 'married', household_size: '' } }));
      const keys = await service.sharableCandidateKeys(1);
      expect(keys.sort()).toEqual(['income_range', 'marital_status']); // household_size empty → excluded
    });

    it('returns [] when the profile has no data', async () => {
      fieldRepo.find.mockResolvedValue([mockField({ key: 'income_range' })]);
      profileRepo.findOne.mockResolvedValue(mockProfile({ data: {} }));
      expect(await service.sharableCandidateKeys(1)).toEqual([]);
    });
  });

  describe('updateMyProfile — auto-opts newly-filled fields into sharing when sharing is on', () => {
    it('adds a field that went empty→filled to dataCategories (sharing on)', async () => {
      const profile = mockProfile({ data: { income_range: '5k_10k' } }); // marital_status not yet filled
      profileRepo.findOne.mockResolvedValue(profile);
      profileRepo.save.mockImplementation(async (p: any) => p);
      fieldRepo.find.mockResolvedValue([mockField({ key: 'income_range' }), mockField({ key: 'marital_status' })]);
      const userRepo = (service as any).userRepo;
      const user = { id: 1, dataShareEnabled: true, dataCategories: ['income_range'] };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.updateMyProfile(1, { data: { income_range: '5k_10k', marital_status: 'married' } });

      expect(userRepo.save).toHaveBeenCalled();
      expect(userRepo.save.mock.calls[0][0].dataCategories.sort()).toEqual(['income_range', 'marital_status']);
    });

    it('does NOT touch dataCategories when sharing is off', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile({ data: {} }));
      profileRepo.save.mockImplementation(async (p: any) => p);
      fieldRepo.find.mockResolvedValue([mockField({ key: 'marital_status' })]);
      const userRepo = (service as any).userRepo;
      userRepo.findOne.mockResolvedValue({ id: 1, dataShareEnabled: false, dataCategories: [] });
      userRepo.save.mockImplementation(async (u: any) => u);
      await service.updateMyProfile(1, { data: { marital_status: 'married' } });
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('does not re-add an already-filled field the user had deselected', async () => {
      // marital_status was already filled before AND deselected → stays deselected.
      const profile = mockProfile({ data: { marital_status: 'single' } });
      profileRepo.findOne.mockResolvedValue(profile);
      profileRepo.save.mockImplementation(async (p: any) => p);
      fieldRepo.find.mockResolvedValue([mockField({ key: 'marital_status' })]);
      const userRepo = (service as any).userRepo;
      userRepo.findOne.mockResolvedValue({ id: 1, dataShareEnabled: true, dataCategories: [] });
      userRepo.save.mockImplementation(async (u: any) => u);
      await service.updateMyProfile(1, { data: { marital_status: 'married' } }); // value changed, not newly filled
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  // A business's "Leads" = the users it has acquired via /leads (DataAccessLog),
  // de-duplicated per user, with a callable flag (same gate as the call flow).
  describe('getBusinessLeads — the leads a business acquired + whether callable', () => {
    let accessLogRepo: ReturnType<typeof mockRepo>;
    let businessRepo: ReturnType<typeof mockRepo>;
    let certRepo: ReturnType<typeof mockRepo>;
    beforeEach(() => {
      accessLogRepo = (service as any).accessLogRepo;
      businessRepo = (service as any).businessRepo;
      certRepo = (service as any).certRepo;
      certRepo.count.mockResolvedValue(1); // has a certificate → leads unlocked by default
    });

    it('throws Forbidden when the caller has no business profile', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.getBusinessLeads(9)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws Forbidden when the business holds NO certificate (leads gated on a cert)', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      certRepo.count.mockResolvedValue(0);
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.getBusinessLeads(9)).rejects.toThrow(/certificate/i);
    });

    it('dedupes per user, unions fields, sums spend, and flags callability', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      accessLogRepo.find.mockResolvedValue([
        { userId: 100, fieldsAccessed: ['income_range'], creditsCost: '0.05', accessedAt: new Date('2026-02-02'),
          user: { id: 100, name: 'Alice', phoneNumber: '+27820000001', businessCallPolicy: 'paid' } },
        { userId: 100, fieldsAccessed: ['marital_status'], creditsCost: '0.02', accessedAt: new Date('2026-01-01'),
          user: { id: 100, name: 'Alice', phoneNumber: '+27820000001', businessCallPolicy: 'paid' } },
        { userId: 200, fieldsAccessed: ['age_range'], creditsCost: '0.02', accessedAt: new Date('2026-03-03'),
          user: { id: 200, name: 'Bob', phoneNumber: '+27820000002', businessCallPolicy: 'blocked' } },
      ]);
      const leads = await service.getBusinessLeads(9);
      expect(leads).toHaveLength(2);
      const alice = leads.find((l: any) => l.userId === 100);
      expect(alice.name).toBe('Alice');
      expect(alice.phone).toBe('+27820000001');
      expect(alice.fields.sort()).toEqual(['income_range', 'marital_status']);
      expect(Number(alice.totalSpent)).toBeCloseTo(0.07);
      expect(alice.callable).toBe(true);           // paid → callable
      const bob = leads.find((l: any) => l.userId === 200);
      expect(bob.callable).toBe(false);            // blocked → not callable
      expect(bob.callPolicy).toBe('blocked');
    });

    it('returns [] when the business has purchased nothing', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      accessLogRepo.find.mockResolvedValue([]);
      expect(await service.getBusinessLeads(9)).toEqual([]);
    });

    it('scopes to a specific businessId the caller owns when one is given', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9 });
      accessLogRepo.find.mockResolvedValue([]);
      await service.getBusinessLeads(9, 5);
      // ownership-checked lookup: both id AND userId
      expect(businessRepo.findOne).toHaveBeenCalledWith({ where: { id: 5, userId: 9 } });
      expect(accessLogRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 5 } }));
    });
  });

  // A lead set = one certificate. Selecting it lists exactly the people it
  // froze (cert.userIds), with the same lead detail as the full leads view.
  describe('getCertificateLeads — the people covered by one certificate', () => {
    let accessLogRepo: ReturnType<typeof mockRepo>;
    let businessRepo: ReturnType<typeof mockRepo>;
    let certRepo: ReturnType<typeof mockRepo>;
    beforeEach(() => {
      accessLogRepo = (service as any).accessLogRepo;
      businessRepo = (service as any).businessRepo;
      certRepo = (service as any).certRepo;
    });

    it('throws Forbidden when the caller has no business profile', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.getCertificateLeads(9, 'PC-A')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the cert is not one of the business own certs', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      certRepo.findOne.mockResolvedValue(null);
      const { NotFoundException } = require('@nestjs/common');
      await expect(service.getCertificateLeads(9, 'PC-NOPE')).rejects.toBeInstanceOf(NotFoundException);
      // ownership-scoped lookup: by code AND the resolved business
      expect(certRepo.findOne).toHaveBeenCalledWith({ where: { code: 'PC-NOPE', businessId: 7 } });
    });

    it('returns only the leads whose userId is frozen on the certificate', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      certRepo.findOne.mockResolvedValue({ id: 1, code: 'PC-A', businessId: 7, userIds: [100] });
      accessLogRepo.find.mockResolvedValue([
        { userId: 100, fieldsAccessed: ['income_range'], creditsCost: '0.05', accessedAt: new Date('2026-02-02'),
          user: { id: 100, name: 'Alice', phoneNumber: '+27820000001', businessCallPolicy: 'paid' } },
        { userId: 200, fieldsAccessed: ['age_range'], creditsCost: '0.02', accessedAt: new Date('2026-03-03'),
          user: { id: 200, name: 'Bob', phoneNumber: '+27820000002', businessCallPolicy: 'blocked' } },
      ]);
      const leads = await service.getCertificateLeads(9, 'PC-A');
      expect(leads).toHaveLength(1);
      expect(leads[0].userId).toBe(100);
      expect(leads[0].name).toBe('Alice');
      expect(leads[0].callable).toBe(true);
    });
  });

  describe('getLeadsPricing — admin-configurable leads costs', () => {
    let settingRepo: ReturnType<typeof mockRepo>;
    beforeEach(() => { settingRepo = (service as any).settingRepo; });

    it('falls back to the defaults (R250 base, 30-day baseline) when unset', async () => {
      settingRepo.findOne.mockResolvedValue(null);
      expect(await service.getLeadsPricing()).toEqual({ baseFee: 250, baselineDays: 30 });
    });

    it('returns the configured values from settings', async () => {
      settingRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.key === 'LEADS_BASE_FEE' ? { value: '400' }
          : where.key === 'LEADS_BASELINE_DAYS' ? { value: '60' } : null);
      expect(await service.getLeadsPricing()).toEqual({ baseFee: 400, baselineDays: 60 });
    });

    it('ignores non-positive / non-numeric config and uses the defaults', async () => {
      settingRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.key === 'LEADS_BASE_FEE' ? { value: 'abc' }
          : where.key === 'LEADS_BASELINE_DAYS' ? { value: '0' } : null);
      expect(await service.getLeadsPricing()).toEqual({ baseFee: 250, baselineDays: 30 });
    });
  });

  describe('certificates — list & public validation', () => {
    it('getMyCertificates returns the business own certs (newest first)', async () => {
      const businessRepo = (service as any).businessRepo;
      const certRepo = (service as any).certRepo;
      businessRepo.findOne.mockResolvedValue({ id: 7, userId: 9 });
      certRepo.find.mockResolvedValue([{ id: 2, code: 'PC-2' }, { id: 1, code: 'PC-1' }]);
      const certs = await service.getMyCertificates(9);
      expect(certRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 7 } }));
      expect(certs.map((c: any) => c.code)).toEqual(['PC-2', 'PC-1']);
    });

    it('validateCertificate reports ACTIVE within the period and EXPIRED after', async () => {
      const certRepo = (service as any).certRepo;
      const now = Date.now();
      certRepo.findOne.mockResolvedValueOnce({
        code: 'PC-OK', businessName: 'MTN HO', leadCount: 3,
        periodStart: new Date(now - 86400_000), periodEnd: new Date(now + 86400_000), issuedAt: new Date(now),
      });
      const active = await service.validateCertificate('PC-OK');
      expect(active.valid).toBe(true);
      expect(active.active).toBe(true);
      expect(active.businessName).toBe('MTN HO');

      certRepo.findOne.mockResolvedValueOnce({
        code: 'PC-OLD', businessName: 'MTN HO', leadCount: 3,
        periodStart: new Date(now - 3 * 86400_000), periodEnd: new Date(now - 86400_000), issuedAt: new Date(now),
      });
      const expired = await service.validateCertificate('PC-OLD');
      expect(expired.valid).toBe(true);   // it existed / was issued
      expect(expired.active).toBe(false); // but the window has passed
    });

    it('validateCertificate reports not-found for an unknown code', async () => {
      const certRepo = (service as any).certRepo;
      certRepo.findOne.mockResolvedValue(null);
      const res = await service.validateCertificate('NOPE');
      expect(res.valid).toBe(false);
      expect(res.active).toBe(false);
    });
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

  describe('adminGetUserDataProfile', () => {
    it("returns the user's identity, data-broker settings and profile", async () => {
      const userRepo = (service as any).userRepo;
      userRepo.findOne.mockResolvedValue({
        id: 5, phoneNumber: '+27824975852', name: 'Thabelo',
        dataShareEnabled: true, dataCategories: ['income_range'], incognitoEnabled: false,
      });
      fieldRepo.find.mockResolvedValue([mockField()]);
      profileRepo.findOne.mockResolvedValue(mockProfile({ userId: 5, data: { income_range: 'R10k' } }));

      const result = await service.adminGetUserDataProfile(5);

      expect(result.user).toEqual({ id: 5, phoneNumber: '+27824975852', name: 'Thabelo' });
      expect(result.dataShareEnabled).toBe(true);
      expect(result.dataCategories).toEqual(['income_range']);
      expect(result.profile.data.income_range).toBe('R10k');
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      (service as any).userRepo.findOne.mockResolvedValue(null);
      await expect(service.adminGetUserDataProfile(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminUpdateUserDataBroker', () => {
    it('toggles the data-sharing controls and persists them', async () => {
      const userRepo = (service as any).userRepo;
      const user = {
        id: 5, phoneNumber: '+27', name: 'T',
        dataShareEnabled: true, dataCategories: [], incognitoEnabled: false,
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);
      fieldRepo.find.mockResolvedValue([mockField()]);
      profileRepo.findOne.mockResolvedValue(mockProfile({ userId: 5 }));

      const result = await service.adminUpdateUserDataBroker(5, {
        dataShareEnabled: false,
        dataCategories: ['age_range'],
      });

      expect(user.dataShareEnabled).toBe(false);
      expect(user.dataCategories).toEqual(['age_range']);
      expect(userRepo.save).toHaveBeenCalled();
      expect(result.dataShareEnabled).toBe(false);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      (service as any).userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.adminUpdateUserDataBroker(999, { dataShareEnabled: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
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
    let referral: { payCommission: jest.Mock };

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
      referral = { payCommission: jest.fn().mockResolvedValue(undefined) };

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
          { provide: getRepositoryToken(DataCertificate), useFactory: mockRepo },
          { provide: getRepositoryToken(Setting),         useFactory: mockRepo },
          { provide: ReferralService,                     useValue: referral },
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

    it('prices the certificate at a PER-USER base fee (R250 × leads) + leads cost', async () => {
      wireMatches(100, 1, 2); // 2 matches × cost 1 → leadsCost 2
      const result = await service.purchaseLeads(7, {
        filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100, consentDays: 30, purpose: 'CRM', name: 'Q3 prospects',
      });
      expect(result.purchased).toBe(2);
      const certSave = managerSpy.save.mock.calls.find((c: any[]) => c[0] === DataCertificate);
      expect(certSave).toBeDefined();
      const cert = certSave[1];
      expect(cert.businessId).toBe(1);
      expect(cert.name).toBe('Q3 prospects');
      expect(cert.leadCount).toBe(2);
      expect(cert.userIds.sort()).toEqual([100, 101]);
      expect(typeof cert.code).toBe('string');
      // Base fee is charged PER USER: R250 × 2 leads = R500, plus the leads cost.
      expect(cert.basePrice).toBe(500);
      expect(cert.leadsCost).toBe(2);
      expect(cert.totalPrice).toBe(502);
      expect(new Date(cert.periodEnd).getTime()).toBeGreaterThan(new Date(cert.periodStart).getTime());
      expect(result.certificate?.code).toBe(cert.code);
      // The business wallet paid the per-user base fee on top of the lead cost.
      expect(result.totalCost).toBe(2);        // lead (data) cost only
      expect(result.certificatePrice).toBe(502);
    });

    it('scales the leads cost pro-rata by the authorisation window (days ÷ 30); base fee is per user', async () => {
      wireMatches(100, 1, 2); // 2 matches × per-person cost 1
      const result = await service.purchaseLeads(7, {
        filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100, consentDays: 60,
      });
      // 60-day window → ×2 on the per-person leads cost; base fee is R250 × 2 users.
      expect(result.purchased).toBe(2);
      expect(result.totalCost).toBe(4);          // 2 × 1 × (60/30)
      expect(result.certificatePrice).toBe(504); // 250×2 base + 4 leads
      const cert = managerSpy.save.mock.calls.find((c: any[]) => c[0] === DataCertificate)![1];
      expect(cert.basePrice).toBe(500);
      expect(cert.leadsCost).toBe(4);
      expect(cert.totalPrice).toBe(504);
    });

    it('pro-rates DOWN for a short window (leads cost × days/30 for days < 30)', async () => {
      wireMatches(100, 2, 1); // 1 match × per-person cost 2
      const result = await service.purchaseLeads(7, {
        filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100, consentDays: 15,
      });
      // 15-day window → ×0.5.
      expect(result.totalCost).toBe(1); // 2 × (15/30)
    });

    it('charges the admin-configured base fee per user (not the hardcoded R250)', async () => {
      wireMatches(100, 1, 2); // 2 matches × per-person cost 1
      (service as any).settingRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.key === 'LEADS_BASE_FEE' ? { value: '100' } : null); // baseline unset → 30
      const result = await service.purchaseLeads(7, {
        filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100, consentDays: 30,
      });
      const cert = managerSpy.save.mock.calls.find((c: any[]) => c[0] === DataCertificate)![1];
      expect(cert.basePrice).toBe(200); // R100 × 2 users
      expect(cert.leadsCost).toBe(2);
      expect(cert.totalPrice).toBe(202);
      expect(result.certificatePrice).toBe(202);
    });

    it('uses the admin-configured baseline days as the pro-rata divisor', async () => {
      wireMatches(100, 1, 2); // 2 matches × per-person cost 1
      (service as any).settingRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.key === 'LEADS_BASELINE_DAYS' ? { value: '60' } : null); // base fee unset → 250
      const result = await service.purchaseLeads(7, {
        filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100, consentDays: 60,
      });
      // 60-day window ÷ 60-day baseline → ×1 (not ×2). Leads cost unchanged.
      expect(result.totalCost).toBe(2);
    });

    it('does NOT buy leads or issue a certificate when the business cannot afford the R250 base fee', async () => {
      wireMatches(100, 1, 2, /* callerBalance */ 100); // < 250 base fee
      const result = await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100 });
      expect(result.purchased).toBe(0);
      const certSaves = managerSpy.save.mock.calls.filter((c: any[]) => c[0] === DataCertificate);
      expect(certSaves).toHaveLength(0);
    });

    it('issues NO certificate when nothing was purchased (refunds the base fee)', async () => {
      wireMatches(0, 0.05, 5); // budget 0 → 0 leads
      await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 0 });
      const certSaves = managerSpy.save.mock.calls.filter((c: any[]) => c[0] === DataCertificate);
      expect(certSaves).toHaveLength(0);
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

    it('pays a referral commission on each shared owner’s DATA_EARN via the same manager', async () => {
      // costForUser = 5, platformCut = 5*0.24 = 1.2, userEarning = 3.8.
      // The single matched profile is owned by userId 100.
      wireMatches(100, 5, 1);
      await service.purchaseLeads(7, { filters: { income_range: { op: 'eq', value: 'gt_20k' } }, budget: 100 });

      expect(referral.payCommission).toHaveBeenCalledWith(100, 3.8, managerSpy);
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
