import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PayToContactService } from './pay-to-contact.service';
import { CallPermissionRequest } from '../data-broker/call-permission-request.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';

/**
 * Pay-to-Contact — economic core (Cycle 1).
 *
 * A business stakes a `bidAmount` to request permission to call a user.
 * `splitEscrow` is the pure function that decides how a staked bid is divided
 * when the call is approved: the platform keeps a fee, the user earns the rest.
 * The business is charged the full bid.
 *
 * Money is held to 4 decimal places to match the wallet column precision
 * (User.walletBalance / Transaction.amount are decimal(10,4)).
 */
describe('PayToContactService.splitEscrow', () => {
  // splitEscrow is pure; deps are irrelevant here so we pass mocks.
  const service = new PayToContactService(
    {} as any, {} as any, {} as any, {} as any,
  );

  it('splits a bid into platform fee and user earnings at the default 30% rate', () => {
    const result = service.splitEscrow(100);
    expect(result).toEqual({
      businessCharge: 100,
      platformFee: 30,
      userEarnings: 70,
    });
  });

  it('honours a custom fee rate', () => {
    expect(service.splitEscrow(50, 0.1)).toEqual({
      businessCharge: 50,
      platformFee: 5,
      userEarnings: 45,
    });
  });

  it('rounds fee and earnings to 4 decimal places', () => {
    const result = service.splitEscrow(10, 0.3333);
    expect(result.platformFee).toBeCloseTo(3.333, 4);
    expect(result.userEarnings).toBeCloseTo(6.667, 4);
    // The two parts must always reconstitute the full charge (no lost cents).
    expect(result.platformFee + result.userEarnings).toBeCloseTo(10, 4);
  });

  it('rejects a non-positive bid', () => {
    expect(() => service.splitEscrow(0)).toThrow();
    expect(() => service.splitEscrow(-5)).toThrow();
  });
});

/**
 * Pay-to-Contact — escrow stake (Cycle 2).
 *
 * When a business attaches a bid to a call-permission request the bid is
 * staked: debited from the business wallet and held against the request. The
 * move is atomic and locks both the request row and the business wallet row
 * (mirrors transfer.send / withdrawal hardening) so concurrent stakes can't
 * double-spend. The audit row is written via the same EntityManager (H10).
 */
describe('PayToContactService.stake', () => {
  let service: PayToContactService;
  let manager: any;
  let tx: { log: jest.Mock };

  beforeEach(async () => {
    manager = {
      // EntityManager.save is called single-arg here (save(entity)); return it.
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
    };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayToContactService,
        { provide: getRepositoryToken(CallPermissionRequest), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: TransactionService, useValue: tx },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(PayToContactService);
  });

  it('debits the business wallet, marks escrow held, and logs CALL_STAKE under the same manager', async () => {
    const request: any = { id: 7, businessId: 3, userId: 9, escrowStatus: 'none' };
    const business: any = { id: 2, walletBalance: 100 };

    manager.findOne
      .mockImplementationOnce(async (_e: any, opts: any) => {
        // First read: the request row, write-locked.
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 7 });
        return { ...request };
      })
      .mockImplementationOnce(async (_e: any, opts: any) => {
        // Then the business wallet row, write-locked.
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 2 });
        return { ...business };
      });

    const result = await service.stake(2, 7, 40);

    // Business charged the full bid (single-arg save(entity)).
    const savedBusiness = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .find((arg: any) => arg && arg.walletBalance !== undefined);
    expect(savedBusiness.walletBalance).toBe(60);

    // Escrow recorded against the request.
    expect(result.escrowStatus).toBe('held');
    expect(Number(result.escrowAmount)).toBe(40);
    expect(Number(result.bidAmount)).toBe(40);

    // Audit row written via the txn manager (H10), as a debit.
    expect(tx.log).toHaveBeenCalledWith(
      2, 'CALL_STAKE', -40, expect.any(String), undefined, manager,
    );
  });

  it('rejects a stake the business cannot afford', async () => {
    manager.findOne
      .mockImplementationOnce(async () => ({ id: 7, escrowStatus: 'none' }))
      .mockImplementationOnce(async () => ({ id: 2, walletBalance: 10 }));
    await expect(service.stake(2, 7, 40)).rejects.toThrow();
  });
});

/**
 * Pay-to-Contact — settle on approval (Cycle 3).
 *
 * When the user approves a staked request the escrow is released: the user is
 * paid their earnings (bid minus platform fee) and the request is marked
 * settled. Atomic, write-locking the request and the user wallet; CALL_EARN is
 * logged via the same manager.
 */
describe('PayToContactService.settle', () => {
  let service: PayToContactService;
  let manager: any;
  let tx: { log: jest.Mock };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
    };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayToContactService,
        { provide: getRepositoryToken(CallPermissionRequest), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: TransactionService, useValue: tx },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(PayToContactService);
  });

  it('pays the user their net earnings, releases the escrow, and logs CALL_EARN', async () => {
    const request: any = { id: 7, userId: 9, escrowAmount: 40, escrowStatus: 'held' };
    const user: any = { id: 9, walletBalance: 5 };

    manager.findOne
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 7 });
        return { ...request };
      })
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 9 });
        return { ...user };
      });

    const result = await service.settle(7);

    // 30% default fee → user earns 28 of the 40 bid; 5 + 28 = 33.
    const savedUser = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .find((arg: any) => arg && arg.walletBalance !== undefined);
    expect(savedUser.walletBalance).toBe(33);

    expect(result.escrowStatus).toBe('released');
    expect(result.escrowAmount).toBeNull();
    expect(result.settledAt).toBeInstanceOf(Date);

    expect(tx.log).toHaveBeenCalledWith(
      9, 'CALL_EARN', 28, expect.any(String), undefined, manager,
    );
  });

  it('refuses to settle a request that is not held', async () => {
    manager.findOne.mockImplementationOnce(async () => ({ id: 7, escrowStatus: 'none' }));
    await expect(service.settle(7)).rejects.toThrow();
  });
});

/**
 * Pay-to-Contact — refund on reject/expire (Cycle 4).
 *
 * If the user rejects (or the request expires) the held escrow is returned in
 * full to the business wallet. Atomic, write-locking the request and the
 * business wallet; CALL_REFUND joins the same transaction. The business user
 * is resolved from the request's eager-loaded business relation.
 */
describe('PayToContactService.refund', () => {
  let service: PayToContactService;
  let manager: any;
  let tx: { log: jest.Mock };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
    };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayToContactService,
        { provide: getRepositoryToken(CallPermissionRequest), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: TransactionService, useValue: tx },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(PayToContactService);
  });

  it('returns the full escrow to the business wallet and logs CALL_REFUND', async () => {
    const request: any = {
      id: 7, userId: 9, escrowAmount: 40, escrowStatus: 'held',
      business: { id: 3, userId: 2 },
    };
    const business: any = { id: 2, walletBalance: 60 };

    manager.findOne
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 7 });
        return { ...request };
      })
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
        expect(opts.where).toMatchObject({ id: 2 });
        return { ...business };
      });

    const result = await service.refund(7);

    const savedBusiness = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .find((arg: any) => arg && arg.walletBalance !== undefined);
    expect(savedBusiness.walletBalance).toBe(100);

    expect(result.escrowStatus).toBe('refunded');
    expect(result.escrowAmount).toBeNull();

    expect(tx.log).toHaveBeenCalledWith(
      2, 'CALL_REFUND', 40, expect.any(String), undefined, manager,
    );
  });

  it('refuses to refund a request that is not held', async () => {
    manager.findOne.mockImplementationOnce(async () => ({ id: 7, escrowStatus: 'released' }));
    await expect(service.refund(7)).rejects.toThrow();
  });
});
