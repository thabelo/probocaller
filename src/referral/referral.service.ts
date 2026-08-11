import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';
import { round4 } from '../common/round4';

export const REFERRAL_RATE_KEY = 'REFERRAL_COMMISSION_RATE';
// Only used to seed the bootstrap row (AdminService.seedDefaultConfig); no
// longer a runtime fallback — a missing/invalid row is a real
// misconfiguration and must fail loudly, like every other SettingsReaderService
// consumer, not silently re-substitute this value.
export const DEFAULT_COMMISSION_RATE = 0.03;

@Injectable()
export class ReferralService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly settingsReader: SettingsReaderService,
  ) {}

  /**
   * The lifetime referral commission rate, as configured by an admin.
   *
   * Read from the settings table rather than the environment: this is
   * operational policy that changes without a deploy, and the apps need to be
   * able to show the real figure instead of a number compiled into their copy.
   * A rate of 0 is a valid kill-switch — payCommission then writes no rows.
   *
   * Unlike the old local parser, a missing/unparseable row is NOT silently
   * replaced with the 3% default (that let a typo in the admin panel silently
   * mis-bill forever) — it throws, via the shared SettingsReaderService, same
   * as every other admin-configurable rate. A configured value outside
   * [0, 1) is likewise rejected rather than clamped.
   */
  async getCommissionRate(): Promise<number> {
    const rate = await this.settingsReader.getNumber(REFERRAL_RATE_KEY);
    if (!(rate >= 0 && rate < 1)) {
      throw new Error(`Invalid ${REFERRAL_RATE_KEY}: ${rate} (must be within [0, 1))`);
    }
    return rate;
  }

  /**
   * Pay an EXTRA admin-configured lifetime commission to the referrer of an
   * earner who just received an activity earning. Platform-funded: the
   * referee keeps 100% of their earning; this only credits the referrer, and
   * the commission is carved out of the PLATFORM's OWN cut of the underlying
   * transaction (e.g. its cut of a call/lead/pay-to-contact charge) — NOT out
   * of the referee's take-home earnings, which are entirely unaffected.
   *
   * `commissionBase` is therefore the platform's own cut of the transaction
   * that produced the earning, not the earner's credited wallet amount.
   *
   * MUST be called with the caller's EntityManager so the wallet credit and the
   * REFERRAL_COMMISSION ledger row join the caller's transaction — atomic with
   * the earning event, never partial.
   *
   * No-ops (return early, zero rows) when: commission is disabled or the base
   * is non-positive; the earner is not referred; the referrer is the earner
   * (defence in depth); the rounded commission is zero; or the referrer row is
   * gone.
   */
  async payCommission(
    earnerId: number,
    commissionBase: number,
    manager: EntityManager,
  ): Promise<void> {
    const rate = await this.getCommissionRate();
    if (commissionBase <= 0 || rate <= 0) return;

    const earner = await manager.findOne(User, { where: { id: earnerId } });
    if (!earner || !earner.referredBy) return;
    const referrerId = earner.referredBy;
    if (referrerId === earnerId) return; // self-referral defence

    const commission = round4(commissionBase * rate);
    if (commission <= 0) return;

    const referrer = await manager.findOne(User, {
      where: { id: referrerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!referrer) return;

    referrer.walletBalance = round4(Number(referrer.walletBalance) + commission);
    await manager.save(referrer);
    await this.transactionService.log(
      referrerId,
      'REFERRAL_COMMISSION',
      commission,
      `Referral commission (${Math.round(rate * 100)}%) from user #${earnerId}`,
      undefined,
      manager,
    );
  }
}
