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
}
