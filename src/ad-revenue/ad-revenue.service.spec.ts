import { Test, TestingModule } from '@nestjs/testing';
import { AdRevenueService, AD_REVENUE_SHARE_RATE_KEY } from './ad-revenue.service';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';
import { User } from '../user/user.entity';

/**
 * Users who opt in to ads earn an admin-configured share (default 7.8%) of the
 * ad revenue their impressions produce, credited to their earnings wallet.
 *
 * Mirrors ReferralService.payCommission: platform-funded, double-entry via the
 * ledger, and driven by a Setting row rather than a constant so the rate is
 * tunable without a deploy. The revenue source is stubbed until an ad-network
 * SDK + server-side revenue signal land — this is the crediting half.
 */
describe('AdRevenueService', () => {
  let service: AdRevenueService;
  let tx: { log: jest.Mock };
  let settingsReader: { getNumber: jest.Mock };
  let manager: { findOne: jest.Mock; save: jest.Mock };

  const user = (over: Partial<User> = {}) =>
    ({ id: 7, adsEnabled: true, walletBalance: '100.0000', ...over }) as any;

  beforeEach(async () => {
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    settingsReader = { getNumber: jest.fn().mockResolvedValue(0.078) };
    manager = {
      findOne: jest.fn().mockResolvedValue(user()),
      save: jest.fn().mockImplementation(async (x: any) => x),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdRevenueService,
        { provide: TransactionService, useValue: tx },
        { provide: SettingsReaderService, useValue: settingsReader },
      ],
    }).compile();
    service = module.get(AdRevenueService);
  });

  describe('getShareRate', () => {
    it('reads the admin-configured rate rather than a compiled-in constant', async () => {
      settingsReader.getNumber.mockResolvedValue(0.1);
      await expect(service.getShareRate()).resolves.toBe(0.1);
      expect(settingsReader.getNumber).toHaveBeenCalledWith(AD_REVENUE_SHARE_RATE_KEY);
    });

    // A typo in the admin panel must fail loudly, not silently mis-pay forever.
    it('rejects a rate outside [0, 1) instead of clamping it', async () => {
      settingsReader.getNumber.mockResolvedValue(1.5);
      await expect(service.getShareRate()).rejects.toThrow(/AD_REVENUE_SHARE_RATE/);
      settingsReader.getNumber.mockResolvedValue(-0.1);
      await expect(service.getShareRate()).rejects.toThrow(/AD_REVENUE_SHARE_RATE/);
    });

    it('accepts 0 as a valid kill-switch', async () => {
      settingsReader.getNumber.mockResolvedValue(0);
      await expect(service.getShareRate()).resolves.toBe(0);
    });
  });

  describe('payShare', () => {
    it('credits the configured share of gross ad revenue and logs it double-entry', async () => {
      await service.payShare(7, 100, manager as any);
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7, walletBalance: 107.8 }));
      expect(tx.log).toHaveBeenCalledWith(
        7,
        'AD_REVENUE_SHARE',
        7.8,
        expect.stringMatching(/ad revenue/i),
        undefined,
        manager,
      );
    });

    it('rounds the credit to 4dp like every other money path', async () => {
      manager.findOne.mockResolvedValue(user({ walletBalance: '0.0000' } as any));
      await service.payShare(7, 0.011, manager as any);
      // 0.011 * 0.078 = 0.000858 → 0.0009
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ walletBalance: 0.0009 }));
    });

    // Opt-in only: crediting a user who never turned ads on would pay them for
    // impressions they never saw, and implies consent they never gave.
    it('pays nothing to a user who has not opted in to ads', async () => {
      manager.findOne.mockResolvedValue(user({ adsEnabled: false } as any));
      await service.payShare(7, 100, manager as any);
      expect(manager.save).not.toHaveBeenCalled();
      expect(tx.log).not.toHaveBeenCalled();
    });

    it('pays nothing when the rate is switched off', async () => {
      settingsReader.getNumber.mockResolvedValue(0);
      await service.payShare(7, 100, manager as any);
      expect(manager.save).not.toHaveBeenCalled();
      expect(tx.log).not.toHaveBeenCalled();
    });

    it('pays nothing for non-positive revenue', async () => {
      for (const gross of [0, -5]) {
        await service.payShare(7, gross, manager as any);
      }
      expect(manager.save).not.toHaveBeenCalled();
      expect(tx.log).not.toHaveBeenCalled();
    });

    it('pays nothing when the rounded share is zero', async () => {
      await service.payShare(7, 0.0001, manager as any); // 0.0001 * 0.078 → 0.0000
      expect(manager.save).not.toHaveBeenCalled();
      expect(tx.log).not.toHaveBeenCalled();
    });

    it('pays nothing when the user row is gone', async () => {
      manager.findOne.mockResolvedValue(null);
      await service.payShare(7, 100, manager as any);
      expect(manager.save).not.toHaveBeenCalled();
      expect(tx.log).not.toHaveBeenCalled();
    });

    // Must join the caller's transaction so the credit and the ledger row are
    // atomic with whatever recorded the revenue — never half-applied.
    it('locks the user row inside the caller transaction', async () => {
      await service.payShare(7, 100, manager as any);
      expect(manager.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ where: { id: 7 }, lock: { mode: 'pessimistic_write' } }),
      );
    });
  });
});
