import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from './referral.service';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';
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
  let settingsReader: { getNumber: jest.Mock };

  /**
   * Set the admin-configured rate for a test. Mirrors the shared
   * SettingsReaderService's own contract: a valid number (including 0,
   * the disable kill-switch) resolves; a missing/invalid row rejects with
   * "Missing or invalid setting: …", exactly like every other rate reader.
   */
  const setRate = (value: string | null) => {
    if (value === null) {
      settingsReader.getNumber.mockRejectedValue(
        new Error('Missing or invalid setting: REFERRAL_COMMISSION_RATE'),
      );
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      settingsReader.getNumber.mockRejectedValue(
        new Error('Missing or invalid setting: REFERRAL_COMMISSION_RATE'),
      );
      return;
    }
    settingsReader.getNumber.mockResolvedValue(n);
  };

  beforeEach(async () => {
    // Default fixture rate mirrors seedDefaultConfig's bootstrap default
    // (0.03) — every test that doesn't call setRate() exercises the
    // payCommission graph logic at the normal 3% rate, matching production
    // where seedDefaultConfig guarantees the row exists.
    settingsReader = { getNumber: jest.fn().mockResolvedValue(0.03) };
    tx = { log: jest.fn().mockResolvedValue(undefined) };
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: TransactionService, useValue: tx },
        { provide: SettingsReaderService, useValue: settingsReader },
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

  // Regression: an unparseable/missing setting used to silently fall back to
  // the 3% default — a typo in the admin panel would silently mis-bill
  // forever. It must now fail loudly instead, matching SettingsReaderService's
  // own no-fallback contract used by every other rate in the app.
  it('propagates a loud failure when the configured rate is missing/unparseable, instead of silently defaulting', async () => {
    setRate('not-a-number');
    wireReferred(3, 7, 100);

    await expect(service.payCommission(3, 10, manager)).rejects.toThrow(/Missing or invalid setting/i);
    expect(tx.log).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a configured rate outside [0, 1) instead of silently clamping to the default', async () => {
    setRate('1.5');
    wireReferred(3, 7, 100);

    await expect(service.payCommission(3, 10, manager)).rejects.toThrow();
    expect(tx.log).not.toHaveBeenCalled();
  });

  // Regression: the description used to hardcode the literal "3%" no matter
  // what rate was actually configured — lying to the user the moment an admin
  // changed REFERRAL_COMMISSION_RATE via PUT /admin/config. It must reflect
  // the ACTUAL configured rate.
  it('describes the commission using the ACTUAL configured rate, not a hardcoded 3%', async () => {
    setRate('0.05');
    wireReferred(3, 7, 100);

    await service.payCommission(3, 10, manager);

    expect(tx.log).toHaveBeenCalledWith(
      7, 'REFERRAL_COMMISSION', 0.5, expect.stringContaining('5%'), undefined, manager,
    );
    const description = tx.log.mock.calls[0][3];
    expect(description).not.toContain('3%');
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
