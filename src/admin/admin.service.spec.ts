import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { User } from '../user/user.entity';
import { CallLog } from '../call/call.entity';
import { Setting } from '../config/setting.entity';
import { Business } from '../business/business.entity';
import { TransactionService } from '../transaction/transaction.service';
import { AuditService } from '../audit/audit.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(async (e: any) => e),
  count: jest.fn(),
  find: jest.fn(),
});

describe('AdminService — addCredit (ADMIN_CREDIT / ADMIN_DEBIT reward path)', () => {
  let service: AdminService;
  let userRepo: ReturnType<typeof mockRepo>;
  let txService: { log: jest.Mock };

  beforeEach(async () => {
    txService = { log: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User),     useFactory: mockRepo },
        { provide: getRepositoryToken(CallLog),  useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),  useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: TransactionService, useValue: txService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service  = module.get(AdminService);
    userRepo = module.get(getRepositoryToken(User));
  });

  it('credits a positive amount and logs ADMIN_CREDIT', async () => {
    const user = { id: 1, name: 'A', walletBalance: 10 } as User;
    userRepo.findOne.mockResolvedValue(user);

    const res = await service.addCredit(1, 5);

    expect(user.walletBalance).toBeCloseTo(15, 6);
    expect(res.walletBalance).toBeCloseTo(15, 6);
    expect(txService.log).toHaveBeenCalledWith(1, 'ADMIN_CREDIT', 5, expect.any(String));
  });

  it('debits a negative amount and logs ADMIN_DEBIT', async () => {
    const user = { id: 1, name: 'A', walletBalance: 10 } as User;
    userRepo.findOne.mockResolvedValue(user);

    await service.addCredit(1, -4);

    expect(user.walletBalance).toBeCloseTo(6, 6);
    expect(txService.log).toHaveBeenCalledWith(1, 'ADMIN_DEBIT', -4, expect.any(String));
  });

  it('throws NotFoundException when the user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.addCredit(999, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  // Regression: a zero (or non-finite) adjustment is never a real credit/debit.
  // The old code logged it as an ADMIN_DEBIT of $0.00 — a misleading no-op
  // ledger entry. It must be rejected and write nothing.
  it('rejects a zero-amount adjustment and writes no transaction', async () => {
    const user = { id: 1, name: 'A', walletBalance: 10 } as User;
    userRepo.findOne.mockResolvedValue(user);

    await expect(service.addCredit(1, 0)).rejects.toBeInstanceOf(BadRequestException);
    expect(txService.log).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});

describe('AdminService — bulk update + CSV export', () => {
  let service: AdminService;
  let userRepo: any;
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    audit = { record: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User),     useFactory: mockRepo },
        { provide: getRepositoryToken(CallLog),  useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),  useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: TransactionService, useValue: { log: jest.fn() } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(AdminService);
    userRepo = module.get(getRepositoryToken(User));
    userRepo.update = jest.fn(async () => ({ affected: 0 }));
  });

  it('bulkUpdateUsers applies a whitelisted patch to the given ids', async () => {
    userRepo.update.mockResolvedValue({ affected: 2 });
    const res = await service.bulkUpdateUsers([1, 2], { isSpam: true });
    const [where, patch] = userRepo.update.mock.calls[0];
    expect(where).toEqual({ id: expect.anything() }); // In([1,2])
    expect(patch).toEqual({ isSpam: true });
    expect(res).toEqual({ updated: 2 });
  });

  it('bulkUpdateUsers writes an audit entry with the actor and patch', async () => {
    userRepo.update.mockResolvedValue({ affected: 2 });
    await service.bulkUpdateUsers([1, 2], { isSpam: true }, 7);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      action: 'admin.users.bulk_update',
      targetType: 'user',
    }));
  });

  it('bulkUpdateUsers drops non-whitelisted fields like walletBalance', async () => {
    userRepo.update.mockResolvedValue({ affected: 1 });
    await service.bulkUpdateUsers([1], { walletBalance: 999, isSpam: true } as any);
    const [, patch] = userRepo.update.mock.calls[0];
    expect(patch).toEqual({ isSpam: true });
  });

  it('bulkUpdateUsers rejects an empty id list', async () => {
    await expect(service.bulkUpdateUsers([], { isSpam: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('bulkUpdateUsers rejects a patch with no whitelisted fields', async () => {
    await expect(service.bulkUpdateUsers([1], { walletBalance: 5 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exportUsersCsv emits a header plus one row per user, escaping formula injection', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, name: '=cmd()', phoneNumber: '+27821234567', email: 'a@b.com', role: 'user', isBusiness: false, walletBalance: 1.5, isSpam: false, createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const csv = await service.exportUsersCsv();
    const lines = csv.trim().split('\n');
    expect(lines[0].toLowerCase()).toContain('id');
    expect(lines).toHaveLength(2);
    expect(csv).toContain("'=cmd()"); // formula-injection guard prefixes a quote
  });
});

describe('AdminService — getStats: earnings vs earnings from invitees', () => {
  let service: AdminService;
  let userRepo: any;
  let callRepo: any;
  let txService: { sumByType: jest.Mock };

  beforeEach(async () => {
    txService = { sumByType: jest.fn().mockResolvedValue(1.2345) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User),     useFactory: mockRepo },
        { provide: getRepositoryToken(CallLog),  useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),  useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: TransactionService, useValue: txService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(AdminService);
    userRepo = module.get(getRepositoryToken(User));
    callRepo = module.get(getRepositoryToken(CallLog));
  });

  it('reports direct call earnings and invitee (referral) earnings separately', async () => {
    userRepo.count.mockResolvedValue(10);
    callRepo.count.mockResolvedValue(2);
    callRepo.find.mockResolvedValue([
      { userEarnings: '5.0000', platformCut: '1', cost: '6', status: 'completed' },
      { userEarnings: '2.5000', platformCut: '0.5', cost: '3', status: 'completed' },
    ]);

    const stats = await service.getStats();

    // Direct earnings = SUM(call.userEarnings); invitee earnings = SUM(REFERRAL_COMMISSION).
    expect(stats.totalPaidToUsers).toBe(7.5);
    expect(txService.sumByType).toHaveBeenCalledWith('REFERRAL_COMMISSION');
    expect(stats.referralEarnings).toBe(1.2345);
  });
});

describe('AdminService — getAllUsers server-side search/pagination (F3)', () => {
  let service: AdminService;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User),     useFactory: mockRepo },
        { provide: getRepositoryToken(CallLog),  useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),  useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: TransactionService, useValue: { log: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(AdminService);
    userRepo = module.get(getRepositoryToken(User));
    userRepo.find.mockResolvedValue([]);
  });

  it('filters by name, phone and email when a search term is given', async () => {
    await service.getAllUsers({ search: 'jane' });
    const arg = userRepo.find.mock.calls[0][0];
    expect(Array.isArray(arg.where)).toBe(true);
    const fields = arg.where.map((w: any) => Object.keys(w)[0]).sort();
    expect(fields).toEqual(['email', 'name', 'phoneNumber']);
  });

  it('returns all users (no where filter) when no search term is given', async () => {
    await service.getAllUsers();
    expect(userRepo.find.mock.calls[0][0].where).toBeUndefined();
  });

  it('applies limit/offset as take/skip', async () => {
    await service.getAllUsers({ limit: 50, offset: 100 });
    const arg = userRepo.find.mock.calls[0][0];
    expect(arg.take).toBe(50);
    expect(arg.skip).toBe(100);
  });
});
