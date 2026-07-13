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
});
