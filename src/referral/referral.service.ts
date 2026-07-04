import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { round4 } from '../common/round4';

const DEFAULT_COMMISSION_RATE = 0.03;

/**
 * Lifetime referral commission rate, from REFERRAL_COMMISSION_RATE.
 * Clamped to [0, 1); invalid values fall back to the 3% default. A value of 0
 * is a valid kill-switch: payCommission early-returns with zero ledger rows, so
 * ops can disable the programme without a deploy.
 */
const resolveReferralCommissionRate = (): number => {
  const raw = Number(process.env.REFERRAL_COMMISSION_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw >= 1) return DEFAULT_COMMISSION_RATE;
  return raw;
};

@Injectable()
export class ReferralService {
  constructor(private readonly transactionService: TransactionService) {}

  /**
   * Pay an EXTRA 3% (configurable) lifetime commission to the referrer of an
   * earner who just received an activity earning. Platform-funded override: the
   * referee keeps 100% of their earning; this only credits the referrer.
   *
   * MUST be called with the caller's EntityManager so the wallet credit and the
   * REFERRAL_COMMISSION ledger row join the caller's transaction — atomic with
   * the earning event, never partial.
   *
   * No-ops (return early, zero rows) when: commission is disabled or the earning
   * is non-positive; the earner is not referred; the referrer is the earner
   * (defence in depth); the rounded commission is zero; or the referrer row is
   * gone.
   */
  async payCommission(
    earnerId: number,
    earnedAmount: number,
    manager: EntityManager,
  ): Promise<void> {
    const rate = resolveReferralCommissionRate();
    if (earnedAmount <= 0 || rate <= 0) return;

    const earner = await manager.findOne(User, { where: { id: earnerId } });
    if (!earner || !earner.referredBy) return;
    const referrerId = earner.referredBy;
    if (referrerId === earnerId) return; // self-referral defence

    const commission = round4(earnedAmount * rate);
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
      `Referral commission (3%) from user #${earnerId}`,
      undefined,
      manager,
    );
  }
}
