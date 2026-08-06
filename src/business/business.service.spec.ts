import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { BusinessService, DEFAULT_BUSINESS_LOGO_URL } from './business.service';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';

const mockRepo = () => ({
  find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
  increment: jest.fn(), update: jest.fn(),
});

const mockTx = () => ({
  findByUser: jest.fn().mockResolvedValue([]),
  findByBusiness: jest.fn().mockResolvedValue([]),
  log: jest.fn(),
});

describe('BusinessService — API keys', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let apiKeyRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let txService: ReturnType<typeof mockTx>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    apiKeyRepo = module.get(getRepositoryToken(ApiKey));
    userRepo = module.get(getRepositoryToken(User));
    txService = module.get(TransactionService);
    apiKeyRepo.create.mockImplementation((x: any) => x);
    apiKeyRepo.save.mockImplementation(async (x: any) => x);
  });

  describe('getWallet — each business has its OWN wallet', () => {
    it("returns the business's balance + its business-scoped ledger (not the owner's)", async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9, companyName: 'Acme', walletBalance: '77.2500' });
      txService.findByBusiness.mockResolvedValue([{ id: 1, type: 'CREDIT_ADDED', amount: '50' }]);
      const res = await service.getWallet(5, 9);
      expect(res.balance).toBe(77.25);
      expect(res.transactions).toHaveLength(1);
      expect(txService.findByBusiness).toHaveBeenCalledWith(5);
      expect(txService.findByUser).not.toHaveBeenCalled();
    });

    it('forbids reading a wallet the caller does not own', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9, companyName: 'Acme' });
      await expect(service.getWallet(5, 999)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s for an unknown business', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.getWallet(404, 9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('topUpWallet', () => {
    it("credits the BUSINESS wallet atomically (not the owner's) and logs a business-scoped transaction", async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9, companyName: 'Acme' });
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 5, userId: 9, walletBalance: '100.0000' }),
        save: jest.fn().mockImplementation(async (...args: any[]) => args[args.length - 1]),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      const res = await service.topUpWallet(5, 9, 50);
      expect(res.balance).toBe(150);
      // the locked row is the Business, and the saved balance lands on it
      expect(manager.findOne).toHaveBeenCalledWith(Business, expect.objectContaining({
        where: { id: 5 },
        // eager relations LEFT JOIN business_numbers — Postgres can't FOR UPDATE
        // the nullable side, so the locked read must skip them (regression).
        loadEagerRelations: false,
      }));
      const saved = manager.save.mock.calls[0];
      expect(Number(saved[saved.length - 1].walletBalance)).toBe(150);
      expect(txService.log).toHaveBeenCalledWith(9, 'CREDIT_ADDED', 50, expect.any(String), undefined, manager, 5);
    });

    it('rejects a non-positive amount', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9 });
      await expect(service.topUpWallet(5, 9, 0)).rejects.toThrow();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('forbids topping up a wallet the caller does not own', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9 });
      await expect(service.topUpWallet(5, 999, 50)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('transferWallet — move money between the owner and a business wallet', () => {
    const wire = (ownerBalance: string, bizBalance: string) => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9, companyName: 'Acme' });
      const rows: Record<string, any> = {
        user: { id: 9, walletBalance: ownerBalance },
        biz: { id: 5, userId: 9, walletBalance: bizBalance },
      };
      const manager = {
        findOne: jest.fn().mockImplementation(async (entity: any) =>
          entity === User ? rows.user : rows.biz),
        save: jest.fn().mockImplementation(async (...args: any[]) => args[args.length - 1]),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { manager, rows };
    };

    it("direction 'in': moves owner money INTO the business wallet, double-logged", async () => {
      const { rows } = wire('200.0000', '10.0000');
      const res = await service.transferWallet(5, 9, 60, 'in');
      expect(Number(rows.user.walletBalance)).toBe(140);
      expect(Number(rows.biz.walletBalance)).toBe(70);
      expect(res.balance).toBe(70); // the business wallet after the move
      // owner ledger entry (negative) + business ledger entry (positive)
      expect(txService.log).toHaveBeenCalledWith(9, 'TRANSFER_TO_BUSINESS', -60, expect.any(String), undefined, expect.anything());
      expect(txService.log).toHaveBeenCalledWith(9, 'TRANSFER_FROM_OWNER', 60, expect.any(String), undefined, expect.anything(), 5);
    });

    it("direction 'out': moves business money back to the owner", async () => {
      const { rows } = wire('200.0000', '80.0000');
      const res = await service.transferWallet(5, 9, 30, 'out');
      expect(Number(rows.user.walletBalance)).toBe(230);
      expect(Number(rows.biz.walletBalance)).toBe(50);
      expect(res.balance).toBe(50);
    });

    it('rejects a transfer the source cannot afford', async () => {
      wire('10.0000', '5.0000');
      await expect(service.transferWallet(5, 9, 60, 'in')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.transferWallet(5, 9, 60, 'out')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive amounts and non-owners', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9 });
      await expect(service.transferWallet(5, 9, 0, 'in')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.transferWallet(5, 999, 10, 'in')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-finite and absurd amounts on every money-moving path (real money)', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 5, userId: 9 });
      for (const bad of [Infinity, -Infinity, NaN, 1e300, 1_000_001]) {
        await expect(service.topUpWallet(5, 9, bad)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.transferWallet(5, 9, bad, 'in')).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(dataSource.transaction).not.toHaveBeenCalled(); // rejected before touching money
    });
  });

  describe('createApiKey', () => {
    it('creates a pk_-prefixed key scoped to the given fields', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme' });
      const result = await service.createApiKey(3, { label: 'CRM', scopes: ['income_range', 'age_range'] });
      expect(result.key).toMatch(/^pk_[a-f0-9]{32,}$/);
      expect(result.businessId).toBe(3);
      expect(result.scopes).toEqual(['income_range', 'age_range']);
      expect(result.label).toBe('CRM');
      expect(apiKeyRepo.save).toHaveBeenCalled();
    });

    it('defaults scopes to all-fields (empty) and throws for a missing business', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3 });
      const noScope = await service.createApiKey(3, {});
      expect(noScope.scopes).toEqual([]);
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.createApiKey(9, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('persists a positive per-call spend cap, and normalises junk/non-positive to null (uncapped)', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3 });
      expect((await service.createApiKey(3, { maxSpendPerCall: 500 })).maxSpendPerCall).toBe(500);
      expect((await service.createApiKey(3, {})).maxSpendPerCall).toBeNull();
      expect((await service.createApiKey(3, { maxSpendPerCall: 0 })).maxSpendPerCall).toBeNull();
      expect((await service.createApiKey(3, { maxSpendPerCall: -5 as any })).maxSpendPerCall).toBeNull();
      expect((await service.createApiKey(3, { maxSpendPerCall: Infinity as any })).maxSpendPerCall).toBeNull();
    });

    it('generates a unique key per call', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3 });
      const a = (await service.createApiKey(3, {})).key;
      const b = (await service.createApiKey(3, {})).key;
      expect(a).not.toBe(b);
    });
  });

  describe('findActiveApiKey', () => {
    it('resolves an active key (with its business) and ignores revoked/blank', async () => {
      const key = { id: 1, key: 'pk_abc', revoked: false, business: { id: 3, userId: 7 } };
      apiKeyRepo.findOne.mockResolvedValue(key);
      expect(await service.findActiveApiKey('pk_abc')).toBe(key);
      expect(apiKeyRepo.findOne).toHaveBeenCalledWith({
        where: { key: 'pk_abc', revoked: false },
        relations: ['business'],
      });
      expect(await service.findActiveApiKey('')).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('marks a key revoked', async () => {
      const key: any = { id: 5, revoked: false };
      apiKeyRepo.findOne.mockResolvedValue(key);
      const res = await service.revokeApiKey(5);
      expect(key.revoked).toBe(true);
      expect(res.revoked).toBe(true);
    });
    it('throws for an unknown key', async () => {
      apiKeyRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeApiKey(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminListApiKeys', () => {
    it('lists all keys with their business, newest first', async () => {
      apiKeyRepo.find.mockResolvedValue([{ id: 1 }]);
      await service.adminListApiKeys();
      expect(apiKeyRepo.find).toHaveBeenCalledWith({ relations: ['business'], order: { createdAt: 'DESC' } });
    });
  });

  describe('recordApiKeyUsage', () => {
    it('increments the call count + spend and stamps lastUsedAt', async () => {
      await service.recordApiKeyUsage(5, 0.4);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'callCount', 1);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'totalSpend', 0.4);
      expect(apiKeyRepo.update).toHaveBeenCalled();
    });

    it('skips the spend increment when nothing was spent', async () => {
      await service.recordApiKeyUsage(5, 0);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'callCount', 1);
      expect(apiKeyRepo.increment).not.toHaveBeenCalledWith({ id: 5 }, 'totalSpend', expect.anything());
    });
  });

  describe('listApiKeysForUser', () => {
    it('lists only keys of businesses owned by the user, newest first', async () => {
      apiKeyRepo.find.mockResolvedValue([{ id: 1, business: { id: 3, userId: 7 } }]);
      const res = await service.listApiKeysForUser(7);
      expect(res).toEqual([{ id: 1, business: { id: 3, userId: 7 } }]);
      expect(apiKeyRepo.find).toHaveBeenCalledWith({
        where: { business: { userId: 7 } },
        relations: ['business'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('createApiKeyForUser', () => {
    it('creates a scoped key for a KYB-verified business the user owns', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, userId: 7, verified: true });
      const res = await service.createApiKeyForUser(7, 3, { label: 'CRM', scopes: ['income_range'] });
      expect(businessRepo.findOne).toHaveBeenCalledWith({ where: { id: 3, userId: 7 } });
      expect(res.businessId).toBe(3);
      expect(res.scopes).toEqual(['income_range']);
      expect(res.key).toMatch(/^pk_[a-f0-9]{32,}$/);
    });

    it('throws NotFound when the business is not found or not owned by the user', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.createApiKeyForUser(7, 999, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden when the owned business is not KYB-verified', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, userId: 7, verified: false });
      await expect(service.createApiKeyForUser(7, 3, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('revokeApiKeyForUser', () => {
    it('revokes a key that belongs to a business the user owns', async () => {
      const key: any = { id: 5, revoked: false, business: { id: 3, userId: 7 } };
      apiKeyRepo.findOne.mockResolvedValue(key);
      const res = await service.revokeApiKeyForUser(7, 5);
      expect(apiKeyRepo.findOne).toHaveBeenCalledWith({ where: { id: 5 }, relations: ['business'] });
      expect(key.revoked).toBe(true);
      expect(res.revoked).toBe(true);
    });

    it('throws NotFound for an unknown key', async () => {
      apiKeyRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeApiKeyForUser(7, 99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws Forbidden when the key belongs to another user's business", async () => {
      apiKeyRepo.findOne.mockResolvedValue({ id: 5, revoked: false, business: { id: 3, userId: 999 } });
      await expect(service.revokeApiKeyForUser(7, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('BusinessService — register requires a country', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
    businessRepo.create.mockImplementation((x: any) => x);
    businessRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 5 }));
    businessRepo.findOne.mockResolvedValue({ id: 5, country: 'ZA' });
    userRepo.findOne.mockResolvedValue({ id: 7, isBusiness: false });
    userRepo.save.mockImplementation(async (x: any) => x);
  });

  const base = { companyName: 'Acme', industry: 'insurance', logoUrl: '/business/logo/acme.png' };

  it('persists the country, upper-cased', async () => {
    await service.register(7, { ...base, country: 'za' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(expect.objectContaining({ country: 'ZA', userId: 7 }));
  });

  // Registering a company is a stronger signal than opting in, so it must also
  // flip the opt-in flag — otherwise a business owner's own business surfaces
  // would stay gated behind the intro they've clearly already moved past.
  it('registering a business also opts the owner into business mode', async () => {
    const owner = { id: 7, isBusiness: false, businessOptIn: false };
    userRepo.findOne.mockResolvedValue(owner);
    await service.register(7, { ...base, country: 'ZA' } as any);
    expect(owner.isBusiness).toBe(true);
    expect(owner.businessOptIn).toBe(true);
  });

  it('rejects a missing country', async () => {
    await expect(service.register(7, base as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a country code that is not ISO 3166-1 alpha-2', async () => {
    await expect(service.register(7, { ...base, country: 'XX' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  // Was: "gives a business with no image the default Probocaller logo".
  // Sharing one mark between every unbranded business is not an identity, so
  // registration now refuses instead of substituting it.
  it('refuses a business with no image instead of substituting the default logo', async () => {
    const { logoUrl, ...noLogo } = base;
    await expect(service.register(7, { ...noLogo, country: 'ZA' } as any)).rejects.toThrow(/logo/i);
    expect(businessRepo.create).not.toHaveBeenCalled();
  });

  it('refuses a blank image rather than falling back', async () => {
    await expect(
      service.register(7, { ...base, country: 'ZA', logoUrl: '   ' } as any),
    ).rejects.toThrow(/logo/i);
    expect(businessRepo.create).not.toHaveBeenCalled();
  });

  it('keeps a logo the caller provides', async () => {
    await service.register(7, { ...base, country: 'ZA', logoUrl: 'https://acme.co/logo.png' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: 'https://acme.co/logo.png' }));
  });
});

describe('BusinessService — calling numbers are stored in E.164', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let numberRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    numberRepo = module.get(getRepositoryToken(BusinessNumber));
    businessRepo.findOne.mockResolvedValue({ id: 3, userId: 7 });
    numberRepo.findOne.mockResolvedValue(null);
    numberRepo.create.mockImplementation((x: any) => x);
    numberRepo.save.mockImplementation(async (x: any) => ({ id: 1, ...x }));
  });

  const base = { businessId: 3, purpose: 'INSURANCE' };

  it('stores an international number in canonical E.164 form', async () => {
    const res: any = await service.addNumber(7, { ...base, phoneNumber: '+27 82 555 0001' });
    expect(res.phoneNumber).toBe('+27825550001');
  });

  it('promotes a South African national number', async () => {
    const res: any = await service.addNumber(7, { ...base, phoneNumber: '0831119999' });
    expect(res.phoneNumber).toBe('+27831119999');
  });

  it('rejects a number with no country code rather than guessing', async () => {
    await expect(service.addNumber(7, { ...base, phoneNumber: '5551234567' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(numberRepo.save).not.toHaveBeenCalled();
  });

  it('checks for duplicates against the normalised number', async () => {
    numberRepo.findOne.mockResolvedValue({ id: 9, phoneNumber: '+27831119999' });
    await expect(service.addNumber(7, { ...base, phoneNumber: '0831119999' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(numberRepo.findOne).toHaveBeenCalledWith({ where: { phoneNumber: '+27831119999' } });
  });
});

// Incoming-call lookups send the LAST 10 DIGITS of the caller (the app's
// processNumber → last10), but calling numbers are stored canonically in E.164
// (+27831119999). An exact-match lookup can therefore never resolve a business
// from a real incoming ring — the identity must match on the digit suffix too.
describe('BusinessService — resolveCallerIdentity matches last-10 lookups against E.164 numbers', () => {
  let service: BusinessService;
  let numberRepo: ReturnType<typeof mockRepo>;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    numberRepo = module.get(getRepositoryToken(BusinessNumber));
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
  });

  it('F7: resolves a last-10 lookup to the business via its OWNER user when no business_number row exists', async () => {
    // Alpha Funded Ltd has no business_number row; its owner is +27861110001.
    numberRepo.findOne.mockResolvedValue(null); // no explicit business number
    userRepo.findOne.mockImplementation(async (opts: any) => {
      const cond = opts?.where?.phoneNumber;
      if (typeof cond === 'object' && cond?._type === 'like'
          && String(cond._value).endsWith('861110001')) {
        return { id: 370, phoneNumber: '+27861110001', isBusiness: true };
      }
      return null;
    });
    businessRepo.findOne.mockResolvedValue({
      id: 34, userId: 370, active: true, companyName: 'Alpha Funded Ltd', industry: 'Finance', verified: true,
    });

    const res = await service.resolveCallerIdentity('7861110001');

    expect(res).not.toBeNull();
    expect(res!.businessId).toBe(34);
    expect(res!.businessProfile!.companyName).toBe('Alpha Funded Ltd');
  });

  const mtnRow = {
    id: 1, phoneNumber: '+27831119999', purpose: 'TELE_SALES', label: null, active: true,
    business: { id: 4, active: true, companyName: 'MTN HO', industry: 'Telecoms', verified: true },
  };

  it('resolves a last-10-digits lookup (7831119999) to the +27-stored business number', async () => {
    // Exact match misses; the suffix pass must find the E.164 row.
    numberRepo.findOne.mockImplementation(async (opts: any) => {
      const cond = opts?.where?.phoneNumber;
      if (cond === '7831119999') return null;                 // exact miss
      if (typeof cond === 'object' && cond?._type === 'like'  // TypeORM Like()
          && String(cond._value).endsWith('7831119999')) return mtnRow;
      return null;
    });

    const res = await service.resolveCallerIdentity('7831119999');

    expect(res).not.toBeNull();
    expect(res!.businessId).toBe(4);
    expect(res!.businessProfile!.companyName).toBe('MTN HO');
  });

  it('still resolves an exact E.164 lookup without a suffix query', async () => {
    numberRepo.findOne.mockResolvedValue(mtnRow);
    const res = await service.resolveCallerIdentity('+27831119999');
    expect(res!.businessId).toBe(4);
    expect(numberRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('does NOT suffix-match short inputs (avoids accidental matches)', async () => {
    numberRepo.findOne.mockResolvedValue(null);
    const res = await service.resolveCallerIdentity('19999');
    expect(res).toBeNull();
    // only the exact attempt — a 5-digit suffix must never wildcard-match
    expect(numberRepo.findOne).toHaveBeenCalledTimes(1);
  });
});

// The caller-ID lookup's funds flag must inspect the wallet BILLING actually
// charges: completeCall debits the business-side OWNER's user wallet. A number
// resolved to a business must therefore expose that owner's balance — not the
// balance of the placeholder user auto-created for the raw calling number.
describe('BusinessService — getOwnerWalletBalance', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
  });

  it("returns the owner user's wallet balance for a business id", async () => {
    businessRepo.findOne.mockResolvedValue({ id: 4, userId: 29 });
    userRepo.findOne.mockResolvedValue({ id: 29, walletBalance: '0.3268' });
    await expect(service.getOwnerWalletBalance(4)).resolves.toBeCloseTo(0.3268, 6);
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 29 } });
  });

  it('returns null for a missing business or owner, and for a null id without querying', async () => {
    await expect(service.getOwnerWalletBalance(null)).resolves.toBeNull();
    expect(businessRepo.findOne).not.toHaveBeenCalled();

    businessRepo.findOne.mockResolvedValue(null);
    await expect(service.getOwnerWalletBalance(404)).resolves.toBeNull();
  });
});

// Logo can be changed on UPDATE, not just at registration — so updateProfile must
// persist a new logoUrl while still refusing to let a caller flip `verified`.
describe('BusinessService — updateProfile persists the logo', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
  });

  it('writes a new logoUrl but ignores an attempt to self-verify', async () => {
    const row: any = { id: 5, userId: 9, companyName: 'Acme', logoUrl: '/old.png', verified: false };
    businessRepo.findOne.mockResolvedValueOnce(row).mockResolvedValueOnce(row);
    businessRepo.save.mockImplementation(async (x: any) => x);

    await service.updateProfile(9, 5, {
      logoUrl: '/business/logo/new.png',
      verified: true, // must be stripped
    } as any);

    expect(row.logoUrl).toBe('/business/logo/new.png');
    expect(row.verified).toBe(false);
  });
});

/**
 * A business caller has to be recognisable at a glance, which means its logo
 * has to reach the device. The caller-identity payload carried the company
 * name, industry and verified flag but not the logo, so nothing in the app
 * could render an icon even for a business that had uploaded one.
 */
describe('BusinessService — a business caller carries its logo', () => {
  let service: BusinessService;
  let numberRepo: ReturnType<typeof mockRepo>;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    numberRepo = module.get(getRepositoryToken(BusinessNumber));
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
  });

  it('returns the logo when the number has a business_number row', async () => {
    numberRepo.findOne.mockResolvedValue({
      id: 1,
      phoneNumber: '+27831110000',
      purpose: 'sales',
      business: {
        id: 4, companyName: 'Riverside Insurance', industry: 'insurance', active: true,
        verified: true, description: 'Cover', logoUrl: '/business/logo/abc.png',
      },
    });
    const res = await service.resolveCallerIdentity('+27831110000');
    expect(res?.businessProfile?.logoUrl).toBe('/business/logo/abc.png');
  });

  /** The owner-number fallback must carry it too, or the same business looks
   *  different depending on which of its numbers rang. */
  it('returns the logo on the owner-number fallback path', async () => {
    numberRepo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockResolvedValue({ id: 7, phoneNumber: '+27861110001', isBusiness: true });
    businessRepo.findOne.mockResolvedValue({
      id: 9, companyName: 'Alpha Funded Ltd', industry: 'finance',
      verified: true, logoUrl: '/business/logo/def.png',
    });
    const res = await service.resolveCallerIdentity('7861110001');
    expect(res?.businessProfile?.logoUrl).toBe('/business/logo/def.png');
  });
});

/**
 * A business now has to bring its own logo.
 *
 * The caller-ID screen shows a business as an icon and a name; falling back to
 * the Probocaller mark made every unbranded business look identical to every
 * other one, which is the opposite of identifying a caller. Registration
 * therefore refuses to create a business without one.
 *
 * Only NEW registrations are held to this — the businesses that predate the
 * rule keep working and keep the fallback.
 */
describe('BusinessService — registration requires a logo', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  const details = {
    companyName: 'Riverside Insurance',
    industry: 'insurance',
    country: 'ZA',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
    businessRepo.create.mockImplementation((v: any) => v);
    businessRepo.save.mockImplementation(async (v: any) => ({ id: 1, ...v }));
    userRepo.findOne.mockResolvedValue({ id: 5, isBusiness: false });
  });

  it('refuses to register a business with no logo', async () => {
    await expect(service.register(5, details as any)).rejects.toThrow(/logo/i);
    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a blank logo rather than silently falling back', async () => {
    await expect(
      service.register(5, { ...details, logoUrl: '   ' } as any),
    ).rejects.toThrow(/logo/i);
    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  /** The shared Probocaller mark is not an identity — it must not be accepted
   *  as one just because a client sent it explicitly. */
  it('refuses the default placeholder logo', async () => {
    await expect(
      service.register(5, { ...details, logoUrl: DEFAULT_BUSINESS_LOGO_URL } as any),
    ).rejects.toThrow(/logo/i);
  });

  it('registers when a real logo is supplied', async () => {
    await service.register(5, { ...details, logoUrl: '/business/logo/abc.png' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: '/business/logo/abc.png' }),
    );
    expect(businessRepo.save).toHaveBeenCalled();
  });
});

/**
 * A business number is stored in E.164 (+27…), but lookups arrive in whatever
 * form the caller had: the dialer sends the last 10 digits of the E.164
 * ("7…"), while search and the contact list send the national form ("0…").
 *
 * The ad-hoc suffix match only ever handled the first: for +27000000001 the
 * last 10 digits are "7000000001", so a search for "0000000001" — the same
 * number — resolved to nobody and the business showed as Unknown.
 */
describe('BusinessService — a business number resolves in national form too', () => {
  let service: BusinessService;
  let numberRepo: ReturnType<typeof mockRepo>;

  const row = {
    id: 1,
    phoneNumber: '+27000000001',
    purpose: 'sales',
    business: {
      id: 1, companyName: 'Acme Leads Co', industry: 'insurance',
      active: true, verified: true, logoUrl: '/business/logo/a.png',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    numberRepo = module.get(getRepositoryToken(BusinessNumber));

    // Only the stored E.164 form exists in the table.
    numberRepo.findOne.mockImplementation(async (opts: any) => {
      const cond = opts?.where?.phoneNumber;
      if (cond === '+27000000001') return row;
      if (cond?._type === 'in' && cond?._value?.includes('+27000000001')) return row;
      return null;
    });
  });

  it('resolves the national 0-form to the business', async () => {
    const res = await service.resolveCallerIdentity('0000000001');
    expect(res?.businessProfile?.companyName).toBe('Acme Leads Co');
  });

  it('still resolves the exact stored E.164 form', async () => {
    const res = await service.resolveCallerIdentity('+27000000001');
    expect(res?.businessProfile?.companyName).toBe('Acme Leads Co');
  });
});

/**
 * The admin path is the same rule.
 *
 * adminRegisterBusiness delegates to register(), so it inherited the logo
 * requirement — but its parameter type had no logoUrl, so an admin could not
 * supply one and every admin-created business would be refused. A rule that
 * cannot be satisfied is a broken path, not an enforced rule.
 *
 * The update path matters too: allowing a logo to be blanked afterwards would
 * reopen exactly the hole registration closed.
 */
describe('BusinessService — the admin paths obey the logo rule too', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  const details = { companyName: 'Riverside', industry: 'insurance', country: 'ZA' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
    businessRepo.create.mockImplementation((v: any) => v);
    businessRepo.save.mockImplementation(async (v: any) => ({ id: 1, ...v }));
    userRepo.findOne.mockResolvedValue({ id: 5, isBusiness: false });
  });

  it('lets an admin supply a logo, so the path is usable at all', async () => {
    await service.adminRegisterBusiness(5, { ...details, logoUrl: '/business/logo/a.png' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: '/business/logo/a.png' }),
    );
  });

  it('still refuses an admin-created business with no logo', async () => {
    await expect(service.adminRegisterBusiness(5, details as any)).rejects.toThrow(/logo/i);
  });

  it('refuses to blank an existing logo on update', async () => {
    businessRepo.findOne.mockResolvedValue({ id: 3, logoUrl: '/business/logo/a.png' });
    await expect(service.adminUpdateProfile(3, { logoUrl: '   ' } as any)).rejects.toThrow(/logo/i);
    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  it('allows an update that replaces the logo with another one', async () => {
    businessRepo.findOne.mockResolvedValue({ id: 3, logoUrl: '/business/logo/a.png' });
    await service.adminUpdateProfile(3, { logoUrl: '/business/logo/b.png' } as any);
    expect(businessRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: '/business/logo/b.png' }),
    );
  });

  /** Updates that don't touch the logo must not be caught by the guard. */
  it('leaves an unrelated update alone', async () => {
    businessRepo.findOne.mockResolvedValue({ id: 3, logoUrl: '/business/logo/a.png' });
    await service.adminUpdateProfile(3, { companyName: 'Renamed' } as any);
    expect(businessRepo.save).toHaveBeenCalled();
  });
});

/**
 * Industry is stored canonically.
 *
 * The mobile form sends display labels ("Insurance", "Banking & Finance") and
 * the web dashboard sends its own list, while the twelve businesses already in
 * production are lowercase. Nothing normalised, so grouping and filtering by
 * industry would split the same industry across cases the moment a business
 * registered from either form.
 */
describe('BusinessService — industry is normalised at the boundary', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;

  const base = { companyName: 'Acme', country: 'ZA', logoUrl: '/business/logo/a.png' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: TransactionService, useFactory: mockTx },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    userRepo = module.get(getRepositoryToken(User));
    businessRepo.create.mockImplementation((v: any) => v);
    businessRepo.save.mockImplementation(async (v: any) => ({ id: 1, ...v }));
    userRepo.findOne.mockResolvedValue({ id: 7, isBusiness: false });
  });

  it('stores a display-cased industry in the same form as the existing rows', async () => {
    await service.register(7, { ...base, industry: 'Insurance' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(expect.objectContaining({ industry: 'insurance' }));
  });

  it('trims stray whitespace', async () => {
    await service.register(7, { ...base, industry: '  Banking & Finance  ' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'banking & finance' }),
    );
  });

  it('leaves an already-canonical industry alone', async () => {
    await service.register(7, { ...base, industry: 'insurance' } as any);
    expect(businessRepo.create).toHaveBeenCalledWith(expect.objectContaining({ industry: 'insurance' }));
  });
});
