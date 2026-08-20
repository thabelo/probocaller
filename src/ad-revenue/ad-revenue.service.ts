import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';
import { round4 } from '../common/round4';

export const AD_REVENUE_SHARE_RATE_KEY = 'AD_REVENUE_SHARE_RATE';
// Only seeds the bootstrap Setting row (see seed-settings.ts); NOT a runtime
// fallback — a missing/invalid row is a real misconfiguration and must fail
// loudly rather than silently re-substitute this value.
export const DEFAULT_AD_REVENUE_SHARE_RATE = 0.078;

@Injectable()
export class AdRevenueService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly settingsReader: SettingsReaderService,
  ) {}

  /**
   * The share of gross ad revenue paid back to the user whose impressions
   * produced it, as configured by an admin (default 7.8%).
   *
   * Read from the settings table, not the environment or a constant: this is
   * operational policy that changes without a deploy, and the app needs to show
   * the real figure rather than a number compiled into its copy. A rate of 0 is
   * a valid kill-switch — payShare then writes no rows. A value outside [0, 1)
   * is rejected rather than clamped, so a typo in the admin panel fails loudly
   * instead of mis-paying forever.
   */
  async getShareRate(): Promise<number> {
    const rate = await this.settingsReader.getNumber(AD_REVENUE_SHARE_RATE_KEY);
    if (!(rate >= 0 && rate < 1)) {
      throw new Error(`Invalid ${AD_REVENUE_SHARE_RATE_KEY}: ${rate} (must be within [0, 1))`);
    }
    return rate;
  }

  /**
   * Credit a user their share of the gross ad revenue their impressions earned.
   * Platform-funded: the platform keeps the remainder.
   *
   * MUST be called with the caller's EntityManager so the wallet credit and the
   * AD_REVENUE_SHARE ledger row join the caller's transaction — atomic with
   * whatever recorded the revenue, never partial.
   *
   * No-ops (return early, zero rows) when: the rate is off or the gross is
   * non-positive; the user has not opted in to ads; the rounded share is zero;
   * or the user row is gone.
   */
  async payShare(userId: number, grossAdRevenue: number, manager: EntityManager): Promise<void> {
    const rate = await this.getShareRate();
    if (grossAdRevenue <= 0 || rate <= 0) return;

    const share = round4(grossAdRevenue * rate);
    if (share <= 0) return;

    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) return;
    // Opt-in only: crediting a user who never enabled ads would pay them for
    // impressions they never saw, and imply a consent they never gave.
    if (!user.adsEnabled) return;

    user.walletBalance = round4(Number(user.walletBalance) + share) as any;
    await manager.save(user);
    await this.transactionService.log(
      userId,
      'AD_REVENUE_SHARE',
      share,
      `Ad revenue share (${Math.round(rate * 1000) / 10}%)`,
      undefined,
      manager,
    );
  }
}
