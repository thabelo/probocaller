import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
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
  ): Promise<Transaction> {
    const data = { userId, type, amount, description, callId: callId ?? null };
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
