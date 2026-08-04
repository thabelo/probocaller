import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AirtimeService } from './airtime.service';
import { AirtimePayout } from './airtime.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { AIRTIME_PROVIDER } from './airtime.provider';

describe('AirtimeService', () => {
  let service: AirtimeService;
  let repo: any;
  let manager: any;
  let tx: { log: jest.Mock };
  let provider: { sendAirtime: jest.Mock };

  const buildUser = (balance: number) => ({ id: 1, walletBalance: balance });

  beforeEach(async () => {
    repo = {
      save: jest.fn().mockImplementation(async (x) => x),
      find: jest.fn().mockResolvedValue([]),
    };
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
      create: jest.fn().mockImplementation((_e: any, data: any) => ({ id: 7, ...data })),
    };
    const dataSource = { transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)) };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    provider = { sendAirtime: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirtimeService,
        { provide: getRepositoryToken(AirtimePayout), useValue: repo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: TransactionService, useValue: tx },
        { provide: AIRTIME_PROVIDER, useValue: provider },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(AirtimeService);
  });

  const dto = { amount: 20, phoneNumber: '0821234567', network: 'MTN' };

  /**
   * Airtime is a South-African-only product: the networks we can top up (Vodacom,
   * MTN, Cell C, Telkom) and the ZAR limits are all SA. The recipient number must
   * therefore be a South African line — a +234 or +44 number can never be served,
   * so it is rejected before the wallet is touched.
   */
  describe('South Africa only', () => {
    it('rejects a recipient number outside South Africa', async () => {
      manager.findOne.mockResolvedValue(buildUser(500));
      await expect(service.redeem(1, { ...dto, phoneNumber: '+2348012345678' }))
        .rejects.toThrow(/South Africa/i);
      // Rejected before any wallet write.
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('accepts +27, 0-prefixed and 27-prefixed South African numbers', async () => {
      manager.findOne.mockResolvedValue(buildUser(500));
      provider.sendAirtime.mockResolvedValue({ providerRef: 'r1', status: 'delivered' });
      for (const phoneNumber of ['+27821234567', '0821234567', '27821234567']) {
        await expect(service.redeem(1, { ...dto, phoneNumber })).resolves.toBeTruthy();
      }
    });
  });

  it('rejects an unsupported network', async () => {
    await expect(service.redeem(1, { ...dto, network: 'SAFARICOM' })).rejects.toThrow(/network/i);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects an amount below the minimum', async () => {
    await expect(service.redeem(1, { ...dto, amount: 1 })).rejects.toThrow(/minimum|at least/i);
  });

  it('rejects an amount above the maximum', async () => {
    await expect(service.redeem(1, { ...dto, amount: 99999 })).rejects.toThrow(/maximum|at most/i);
  });

  it('rejects when the wallet balance is insufficient (no debit)', async () => {
    manager.findOne.mockResolvedValue(buildUser(5));
    await expect(service.redeem(1, dto)).rejects.toThrow(/insufficient/i);
    expect(provider.sendAirtime).not.toHaveBeenCalled();
  });

  it('debits the wallet, sends airtime, and marks it delivered on success', async () => {
    const user = buildUser(100);
    manager.findOne.mockResolvedValue(user);
    provider.sendAirtime.mockResolvedValue({ providerRef: 'RLD-123', status: 'delivered' });

    const result = await service.redeem(1, dto);

    // wallet debited by the amount
    expect(user.walletBalance).toBe(80);
    // reserved as pending, then confirmed delivered with the provider ref
    expect(provider.sendAirtime).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20, network: 'MTN' }),
    );
    expect(result.status).toBe('delivered');
    expect(result.providerRef).toBe('RLD-123');
    // debit audit logged
    expect(tx.log).toHaveBeenCalledWith(1, 'AIRTIME_REDEEMED', -20, expect.any(String), undefined, manager);
  });

  it('refunds the wallet and marks failed when the provider errors', async () => {
    const user = buildUser(100);
    manager.findOne.mockResolvedValue(user);
    provider.sendAirtime.mockRejectedValue(new Error('provider down'));

    await expect(service.redeem(1, dto)).rejects.toThrow();

    // debited then refunded → net zero
    expect(user.walletBalance).toBe(100);
    // refund audit logged
    expect(tx.log).toHaveBeenCalledWith(1, 'AIRTIME_REFUNDED', 20, expect.any(String), undefined, manager);
  });

  it('locks the wallet row for the atomic debit', async () => {
    manager.findOne.mockImplementation(async (_e: any, opts: any) => {
      expect(opts).toMatchObject({ lock: { mode: 'pessimistic_write' } });
      return buildUser(100);
    });
    provider.sendAirtime.mockResolvedValue({ providerRef: 'x', status: 'delivered' });
    await service.redeem(1, dto);
    expect(manager.findOne).toHaveBeenCalled();
  });

  /**
   * Airtime requests are processed by a ProboCaller admin, not an external
   * provider: redeem reserves the money and queues the request, and an admin
   * later confirms the manual top-up or rejects it (refunding the user). This is
   * the same shape as bank withdrawals.
   */
  describe('admin-processed queue', () => {
    it('queues the request as pending without calling any provider', async () => {
      manager.findOne.mockResolvedValue(buildUser(500));

      const payout = await service.redeem(1, dto);

      expect(payout.status).toBe('pending');
      expect(provider.sendAirtime).not.toHaveBeenCalled();
    });

    it('still debits the wallet up front so the money cannot be spent twice', async () => {
      const user = buildUser(500);
      manager.findOne.mockResolvedValue(user);

      await service.redeem(1, { ...dto, amount: 20 });

      expect(user.walletBalance).toBe(480);
      expect(tx.log).toHaveBeenCalledWith(
        1, 'AIRTIME_REDEEMED', -20, expect.any(String), undefined, manager,
      );
    });

    it('lists requests for an admin, newest first, filtered by status', async () => {
      await service.listAll('pending');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' }, order: { createdAt: 'DESC' } }),
      );
    });

    it('marks a queued request delivered with the admin top-up reference', async () => {
      const payout = { id: 7, userId: 1, amount: 20, status: 'pending' };
      manager.findOne.mockResolvedValue(payout);

      const out = await service.review(99, 7, 'delivered', 'MTN receipt 4471');

      expect(out.status).toBe('delivered');
      expect(out.providerRef).toBe('MTN receipt 4471');
    });

    it('refunds the user when an admin rejects a queued request', async () => {
      const payout = { id: 7, userId: 1, amount: 20, status: 'pending' };
      const user = buildUser(480);
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === User ? user : payout,
      );

      const out = await service.review(99, 7, 'failed', 'No operator coverage');

      expect(out.status).toBe('failed');
      expect(out.failureReason).toBe('No operator coverage');
      expect(user.walletBalance).toBe(500);
      expect(tx.log).toHaveBeenCalledWith(
        1, 'AIRTIME_REFUNDED', 20, expect.stringContaining('refunded'), undefined, manager,
      );
    });

    it('refuses to review a request that is no longer pending', async () => {
      manager.findOne.mockResolvedValue({ id: 7, userId: 1, amount: 20, status: 'delivered' });
      await expect(service.review(99, 7, 'failed', 'too late')).rejects.toThrow(/pending/i);
    });
  });
});
