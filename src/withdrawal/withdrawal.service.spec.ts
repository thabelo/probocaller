import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WithdrawalService } from './withdrawal.service';
import { Withdrawal } from './withdrawal.entity';
import { User } from '../user/user.entity';
import { BankAccountService } from '../bank-account/bank-account.service';
import { FicaService } from '../fica/fica.service';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * Security regression — Backend C4.
 *
 * Without pessimistic_write locks on the Withdrawal row and the User wallet
 * row inside `cancel()` and `review()` transactions, a user racing
 * cancel-while-admin-paying can produce a double-refund (admin marks paid + user
 * gets refund) or a paid-and-cancelled state.
 *
 * These tests assert that both methods request the lock when re-reading rows
 * inside the transaction.
 */

const makeWithdrawal = (overrides: Partial<Withdrawal> = {}): Withdrawal =>
  ({ id: 10, userId: 1, amount: 50, status: 'pending', ...overrides } as Withdrawal);
const makeUser = (overrides: Partial<User> = {}): User =>
  ({ id: 1, walletBalance: 100, ...overrides } as User);

describe('WithdrawalService — wallet lock hardening (C4)', () => {
  let service: WithdrawalService;
  let manager: any;

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save:    jest.fn().mockImplementation(async (x) => x),
      create:  jest.fn().mockImplementation((_e, data) => ({ ...data })),
    };

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        { provide: getRepositoryToken(Withdrawal), useValue: { find: jest.fn(), findOne: jest.fn() } },
        { provide: getRepositoryToken(User),       useValue: { findOne: jest.fn() } },
        { provide: BankAccountService,            useValue: { getByUser: jest.fn() } },
        { provide: FicaService,                   useValue: { isApproved: jest.fn().mockResolvedValue(true) } },
        { provide: TransactionService,            useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource,                    useValue: dataSource },
        { provide: SettingsReaderService,         useValue: { getNumber: jest.fn().mockResolvedValue(3) } },
      ],
    }).compile();

    service = module.get(WithdrawalService);
  });

  it('cancel() locks both the Withdrawal row and the User wallet row', async () => {
    const w = makeWithdrawal();
    const u = makeUser();

    manager.findOne
      .mockImplementationOnce(async (_entity: any, opts: any) => {
        // First read inside the txn is the withdrawal row.
        expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
        expect(opts.where).toMatchObject({ id: w.id, userId: w.userId });
        return { ...w };
      })
      .mockImplementationOnce(async (_entity: any, opts: any) => {
        // Then the user row, to credit back the held amount.
        expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
        expect(opts.where).toMatchObject({ id: w.userId });
        return { ...u };
      });

    await service.cancel(w.userId, w.id);
    expect(manager.save).toHaveBeenCalled();
  });

  it('review() locks the Withdrawal row (and the User row when refunding)', async () => {
    const w = makeWithdrawal();
    const u = makeUser();

    manager.findOne
      .mockImplementationOnce(async (_entity: any, opts: any) => {
        expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
        expect(opts.where).toMatchObject({ id: w.id });
        return { ...w };
      })
      .mockImplementationOnce(async (_entity: any, opts: any) => {
        expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
        expect(opts.where).toMatchObject({ id: w.userId });
        return { ...u };
      });

    // 'rejected' decision triggers the refund path which needs the user lock.
    await service.review(/* adminUserId */ 99, w.id, 'rejected', 'no reason');
    expect(manager.save).toHaveBeenCalled();
  });
});

/**
 * Phase 1.5 — cap on pending withdrawals per user.
 *
 * A user with N pending withdrawals already cannot create another one;
 * they must wait for review (or cancel one) first. Default cap = 3,
 * admin-configurable via the WITHDRAWAL_PENDING_CAP setting row (read
 * through the shared SettingsReaderService, not process.env).
 */
describe('WithdrawalService — pending withdrawal cap', () => {
  let service: WithdrawalService;
  let withdrawalRepo: { count: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let settingsReader: { getNumber: jest.Mock };

  async function build(cap = 3) {
    withdrawalRepo = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 1, walletBalance: 1000 }),
      save: jest.fn().mockImplementation(async (x) => x),
      create: jest.fn().mockImplementation((_e, data) => ({ id: 42, ...data })),
    };
    const dataSource = { transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)) };
    settingsReader = { getNumber: jest.fn().mockResolvedValue(cap) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        { provide: getRepositoryToken(Withdrawal), useValue: withdrawalRepo },
        { provide: getRepositoryToken(User),       useValue: { findOne: jest.fn() } },
        { provide: BankAccountService,            useValue: { getByUser: jest.fn().mockResolvedValue({ bankName: 'X', accountHolder: 'Y', accountNumber: '1', accountType: 'savings' }) } },
        { provide: FicaService,                   useValue: { isApproved: jest.fn().mockResolvedValue(true) } },
        { provide: TransactionService,            useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource,                    useValue: dataSource },
        { provide: SettingsReaderService,         useValue: settingsReader },
      ],
    }).compile();

    service = module.get(WithdrawalService);
  }

  it('allows a new request when pending count is below the default cap (3)', async () => {
    await build();
    withdrawalRepo.count.mockResolvedValue(2);
    await expect(service.request(1, 10)).resolves.toBeDefined();
    expect(withdrawalRepo.count).toHaveBeenCalledWith({ where: { userId: 1, status: 'pending' } });
    expect(settingsReader.getNumber).toHaveBeenCalledWith('WITHDRAWAL_PENDING_CAP');
  });

  it('rejects when pending count is at the default cap', async () => {
    await build();
    withdrawalRepo.count.mockResolvedValue(3);
    await expect(service.request(1, 10)).rejects.toThrow(/pending withdrawal/i);
  });

  it('honours the admin-configured WITHDRAWAL_PENDING_CAP setting', async () => {
    await build(1);
    withdrawalRepo.count.mockResolvedValue(1);
    await expect(service.request(1, 10)).rejects.toThrow(/pending withdrawal/i);
  });

  /**
   * The mobile app previously hardcoded this cap client-side with no server
   * source. getConfig() exposes the SAME cap value request() enforces, so
   * GET /withdrawals/config (controller) and request()'s ForbiddenException
   * can never drift apart.
   */
  it('getConfig() exposes the default pending cap', async () => {
    await build();
    await expect(service.getConfig()).resolves.toEqual({ pendingCap: 3 });
  });

  it('getConfig() honours the admin-configured WITHDRAWAL_PENDING_CAP setting', async () => {
    await build(7);
    await expect(service.getConfig()).resolves.toEqual({ pendingCap: 7 });
  });

  // Regression: a genuinely missing/invalid setting must fail loudly, not
  // silently fall back to a hardcoded 3 — SettingsReaderService's own
  // no-fallback contract.
  it('propagates a loud failure when WITHDRAWAL_PENDING_CAP is missing/invalid', async () => {
    await build();
    settingsReader.getNumber.mockRejectedValue(new Error('Missing or invalid setting: WITHDRAWAL_PENDING_CAP'));
    await expect(service.getConfig()).rejects.toThrow(/Missing or invalid setting/i);
  });
});
