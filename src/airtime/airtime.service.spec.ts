import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AirtimeService } from './airtime.service';
import { AirtimePayout } from './airtime.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { AIRTIME_PROVIDER } from './airtime.provider';
import { SettingsReaderService } from '../config/settings-reader.service';

describe('AirtimeService', () => {
  let service: AirtimeService;
  let repo: any;
  let manager: any;
  let tx: { log: jest.Mock };
  let provider: { sendAirtime: jest.Mock };
  let settingsReader: { getNumber: jest.Mock };

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
    // Mirrors seedDefaultConfig's AIRTIME_MIN_ZAR / AIRTIME_MAX_ZAR bootstrap
    // defaults (5 / 1000), sourced from the shared SettingsReaderService
    // instead of process.env.
    settingsReader = {
      getNumber: jest.fn().mockImplementation(async (key: string) => {
        if (key === 'AIRTIME_MIN_ZAR') return 5;
        if (key === 'AIRTIME_MAX_ZAR') return 1000;
        throw new Error(`unexpected setting key in test: ${key}`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirtimeService,
        { provide: getRepositoryToken(AirtimePayout), useValue: repo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: TransactionService, useValue: tx },
        { provide: AIRTIME_PROVIDER, useValue: provider },
        { provide: DataSource, useValue: dataSource },
        { provide: SettingsReaderService, useValue: settingsReader },
      ],
    }).compile();

    service = module.get(AirtimeService);
  });

  describe('networks — min/max are admin-configurable, not hardcoded', () => {
    it('reads AIRTIME_MIN_ZAR / AIRTIME_MAX_ZAR through the shared SettingsReaderService', async () => {
      const result = await service.networks();
      expect(result.min).toBe(5);
      expect(result.max).toBe(1000);
      expect(settingsReader.getNumber).toHaveBeenCalledWith('AIRTIME_MIN_ZAR');
      expect(settingsReader.getNumber).toHaveBeenCalledWith('AIRTIME_MAX_ZAR');
    });

    it('reflects an admin-configured min/max, not the bootstrap default', async () => {
      settingsReader.getNumber.mockImplementation(async (key: string) =>
        key === 'AIRTIME_MIN_ZAR' ? 10 : 500);
      const result = await service.networks();
      expect(result.min).toBe(10);
      expect(result.max).toBe(500);
    });

    // Regression: a missing/invalid setting must fail loudly, not silently
    // fall back to a hardcoded 5/1000 — SettingsReaderService's own
    // no-fallback contract.
    it('propagates a loud failure when the min/max setting is missing/invalid', async () => {
      settingsReader.getNumber.mockRejectedValue(new Error('Missing or invalid setting: AIRTIME_MIN_ZAR'));
      await expect(service.networks()).rejects.toThrow(/Missing or invalid setting/i);
    });
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

  // Airtime is no longer sent automatically. redeem() reserves the money and
  // queues the request; an admin tops the number up and resolves it in
  // review(), which is where delivery and refunds are covered. These two tests
  // previously asserted an auto-send through AIRTIME_PROVIDER that the service
  // stopped doing — they now pin the reserve-and-queue behaviour instead.
  it('debits the wallet and queues the request as pending', async () => {
    const user = buildUser(100);
    manager.findOne.mockResolvedValue(user);

    const result = await service.redeem(1, dto);

    expect(user.walletBalance).toBe(80);
    expect(result.status).toBe('pending');
    expect(manager.save).toHaveBeenCalled();
  });

  it('reserves the money without contacting any provider', async () => {
    manager.findOne.mockResolvedValue(buildUser(100));

    await service.redeem(1, dto);

    // The debit is a reservation, not a purchase: nothing is sent until an
    // admin confirms they topped the number up.
    expect(provider.sendAirtime).not.toHaveBeenCalled();
  });

  it('records the debit against the user as an audit entry', async () => {
    manager.findOne.mockResolvedValue(buildUser(100));

    await service.redeem(1, dto);

    expect(tx.log).toHaveBeenCalledWith(
      1, 'AIRTIME_REDEEMED', -20, expect.any(String), undefined, manager,
    );
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
