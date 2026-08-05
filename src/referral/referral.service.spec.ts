import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralService } from './referral.service';
import { TransactionService } from '../transaction/transaction.service';
import { Setting } from '../config/setting.entity';
import { User } from '../user/user.entity';

/**
 * ReferralService.payCommission — lifetime 3% revenue share.
 *
 * Whenever a user who was referred (`referredBy` set) RECEIVES an activity
 * earning, their referrer earns an EXTRA 3% of that earning (platform-funded;
 * the referee keeps 100%). The credit + ledger row always join the CALLER's
 * transaction via the passed EntityManager, so it commits/rolls back atomically
 * with the earning event.
 */
describe('ReferralService.payCommission', () => {
  let service: ReferralService;
  let tx: { log: jest.Mock };
  let manager: any;
  let settingRepo: any;

  /** Set the admin-configured rate for a test. */
  const setRate = (value: string | null) =>
    settingRepo.findOne.mockResolvedValue(value === null ? null : { key: 'REFERRAL_COMMISSION_RATE', value });

  beforeEach(async () => {
    settingRepo = { findOne: jest.fn().mockResolvedValue(null) };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: TransactionService, useValue: tx },
        { provide: getRepositoryToken(Setting), useValue: settingRepo },
      ],
    }).compile();
    service = module.get(ReferralService);
  });

  // earner is referred by referrer (id 7); referrer wallet starts at 100.
  const wireReferred = (earnerId: number, referrerId: number, referrerBal: number | string = 100) => {
    manager.findOne.mockImplementation(async (_e: any, opts: any) => {
      const id = opts.where.id;
      if (id === earnerId) return { id: earnerId, referredBy: referrerId, walletBalance: 0 };
      if (id === referrerId) return { id: referrerId, walletBalance: referrerBal };
      return null;
    });
  };

  it('credits the referrer exactly 3% of the earning and logs REFERRAL_COMMISSION via the manager', async () => {
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    const savedReferrer = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .find((arg: any) => arg && arg.id === 7);
    expect(savedReferrer.walletBalance).toBe(100.3); // 100 + 3% of 10

    expect(tx.log).toHaveBeenCalledWith(
      7, 'REFERRAL_COMMISSION', 0.3, expect.stringContaining('#3'), undefined, manager,
    );
  });

  it('pays one level only — never looks up or credits the referrer’s own referrer', async () => {
    // Chain: earner 3 → referrer 7 → grandparent 9. Paying the earner must
    // touch only the direct referrer (7); the grandparent (9) is never read or
    // credited (no upline cascade).
    manager.findOne.mockImplementation(async (_e: any, opts: any) => {
      const id = opts.where.id;
      if (id === 3) return { id: 3, referredBy: 7, walletBalance: 0 };
      if (id === 7) return { id: 7, referredBy: 9, walletBalance: 100 };
      if (id === 9) return { id: 9, referredBy: null, walletBalance: 500 };
      return null;
    });

    await service.payCommission(3, 10, manager);

    expect(tx.log).toHaveBeenCalledTimes(1); // exactly one commission, for #7
    expect(tx.log).toHaveBeenCalledWith(7, 'REFERRAL_COMMISSION', 0.3, expect.any(String), undefined, manager);
    // The grandparent (9) is never even fetched.
    expect(manager.findOne.mock.calls.some(([, o]: any) => o?.where?.id === 9)).toBe(false);
  });

  it('write-locks the referrer row before crediting (pessimistic_write)', async () => {
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    const referrerCall = manager.findOne.mock.calls.find(
      ([_e, opts]: any) => opts?.where?.id === 7,
    );
    expect(referrerCall).toBeTruthy();
    expect(referrerCall[1]).toMatchObject({ lock: { mode: 'pessimistic_write' } });
  });

  it('does nothing when the earner has no referrer', async () => {
    manager.findOne.mockImplementation(async (_e: any, opts: any) =>
      opts.where.id === 3 ? { id: 3, referredBy: null, walletBalance: 0 } : null);

    await service.payCommission(3, 10, manager);

    expect(tx.log).not.toHaveBeenCalled();
    const walletSaves = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .filter((a: any) => a && a.walletBalance !== undefined);
    expect(walletSaves).toHaveLength(0);
  });

  it('does nothing when the earned amount is zero or negative', async () => {
    wireReferred(3, 7, 100);
    await service.payCommission(3, 0, manager);
    await service.payCommission(3, -5, manager);
    expect(tx.log).not.toHaveBeenCalled();
  });

  it('self-referral guard: earner referred by themselves earns no commission', async () => {
    manager.findOne.mockImplementation(async (_e: any, opts: any) =>
      opts.where.id === 3 ? { id: 3, referredBy: 3, walletBalance: 0 } : null);

    await service.payCommission(3, 10, manager);

    expect(tx.log).not.toHaveBeenCalled();
  });

  it('a configured rate of 0 disables commission entirely (no read, no write, no log)', async () => {
    setRate('0');
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    expect(tx.log).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  /**
   * The rate is operational policy, so it lives in the settings table and is
   * changed from the admin panel — not baked into the deployment's environment,
   * where changing it means a redeploy and the app can never be told.
   */
  it('reads the rate an admin configured, without a redeploy', async () => {
    setRate('0.10');
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    expect(tx.log).toHaveBeenCalledWith(
      7, 'REFERRAL_COMMISSION', 1, expect.any(String), undefined, manager,
    );
  });

  it('invalid/out-of-range rate falls back to the 3% default', async () => {
    setRate('not-a-number');
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    expect(tx.log).toHaveBeenCalledWith(
      7, 'REFERRAL_COMMISSION', 0.3, expect.any(String), undefined, manager,
    );
  });

  it('rounds the commission to 4 decimal places', async () => {
    wireReferred(3, 7, 0);
    // 1.52 * 0.03 = 0.0456 exactly at 4dp
    await service.payCommission(3, 1.52, manager);
    expect(tx.log).toHaveBeenCalledWith(
      7, 'REFERRAL_COMMISSION', 0.0456, expect.any(String), undefined, manager,
    );
  });

  it('skips when the rounded commission is zero (tiny earning)', async () => {
    wireReferred(3, 7, 100);
    // 0.001 * 0.03 = 0.00003 -> round4 -> 0 -> no row
    await service.payCommission(3, 0.001, manager);
    expect(tx.log).not.toHaveBeenCalled();
  });

  it('coerces string wallet balances from Postgres (no string concat)', async () => {
    wireReferred(3, 7, '100.0000');

    await service.payCommission(3, 10, manager);

    const savedReferrer = manager.save.mock.calls
      .map((c: any[]) => c[0])
      .find((arg: any) => arg && arg.id === 7);
    expect(savedReferrer.walletBalance).toBe(100.3);
    expect(typeof savedReferrer.walletBalance).toBe('number');
  });

  it('does nothing when the referrer row has vanished', async () => {
    manager.findOne.mockImplementation(async (_e: any, opts: any) =>
      opts.where.id === 3 ? { id: 3, referredBy: 7, walletBalance: 0 } : null);

    await service.payCommission(3, 10, manager);

    expect(tx.log).not.toHaveBeenCalled();
  });
});
