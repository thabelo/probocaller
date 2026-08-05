import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { Setting } from '../config/setting.entity';
import { round4 } from '../common/round4';

export const REFERRAL_RATE_KEY = 'REFERRAL_COMMISSION_RATE';
export const DEFAULT_COMMISSION_RATE = 0.03;

/**
 * Clamp a stored rate to something payable. Out of range or unparseable falls
 * back to the default rather than paying a nonsense amount.
 */
export function parseCommissionRate(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n >= 1) return DEFAULT_COMMISSION_RATE;
  return n;
}

@Injectable()
export class ReferralService {
  constructor(
    private readonly transactionService: TransactionService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  /**
   * The lifetime referral commission rate, as configured by an admin.
   *
   * Read from the settings table rather than the environment: this is
   * operational policy that changes without a deploy, and the apps need to be
   * able to show the real figure instead of a number compiled into their copy.
   * A rate of 0 is a valid kill-switch — payCommission then writes no rows.
   */
  async getCommissionRate(): Promise<number> {
    const setting = await this.settingRepository.findOne({ where: { key: REFERRAL_RATE_KEY } });
    return parseCommissionRate(setting?.value);
  }

  /**
   * Pay an EXTRA admin-configured lifetime commission to the referrer of an
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
    const rate = await this.getCommissionRate();
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
