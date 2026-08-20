import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
    // Optional: many call sites (and most unit tests) construct this service
    // without the metrics module, and observability must never be a hard
    // dependency of a money path.
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Append a row to the wallet audit log.
   *
   * Pass `manager` when called from inside `dataSource.transaction(async (m) => …)`
   * so the audit insert joins the same transaction — without that, the log
   * commits on its own connection and can disagree with the wallet move when
   * the wrapping transaction rolls back (finding H10).
   */
  async log(
    userId: number,
    type: string,
    amount: number,
    description: string,
    callId?: number,
    manager?: EntityManager,
    businessId?: number,
  ): Promise<Transaction> {
    const data = { userId, type, amount, description, callId: callId ?? null, businessId: businessId ?? null };
    // Every ledger row is money actually moving, so this single choke point
    // feeds money_moved_zar_total for ALL flows. Guarded because a broken
    // counter must never roll back or fail the wallet move it is measuring.
    try {
      this.metrics?.recordMoneyMoved(type, Number(amount));
    } catch {
      /* observability only — never break the ledger write */
    }
    if (manager) {
      const tx = manager.create(Transaction, data);
      return manager.save(Transaction, tx);
    }
    const tx = this.txRepo.create(data);
    return this.txRepo.save(tx);
  }

  async findByUser(userId: number): Promise<Transaction[]> {
    return this.txRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** The per-business wallet ledger — rows stamped with that businessId. */
  async findByBusiness(businessId: number): Promise<Transaction[]> {
    return this.txRepo.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findAll(): Promise<Transaction[]> {
    return this.txRepo.find({ order: { createdAt: 'DESC' }, take: 500 });
  }

  /**
   * Lifetime SUM(amount) of one user's transactions of a single type, as a
   * clean 4dp money Number. The decimal column makes the DB hand back the SUM
   * as a string (or null when no rows match), so COALESCE-to-0 then normalise
   * — callers must never see a string or NaN. Used for the referral-earnings
   * figure (type 'REFERRAL_COMMISSION') on GET /user/referral-code.
   */
  async sumByUserAndType(userId: number, type: string): Promise<number> {
    const { sum } = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type })
      .getRawOne();
    return Number(parseFloat(sum ?? 0).toFixed(4));
  }

  /**
   * Platform-wide SUM(amount) of one transaction type across every user, as a
   * clean 4dp money Number. Same string/null → Number contract as
   * sumByUserAndType. Powers the admin "earnings from invitees" total
   * (type 'REFERRAL_COMMISSION').
   */
  async sumByType(type: string): Promise<number> {
    const { sum } = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.type = :type', { type })
      .getRawOne();
    return Number(parseFloat(sum ?? 0).toFixed(4));
  }
}
