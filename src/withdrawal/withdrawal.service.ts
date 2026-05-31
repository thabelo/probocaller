import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from './withdrawal.entity';
import { User } from '../user/user.entity';
import { BankAccountService } from '../bank-account/bank-account.service';
import { FicaService } from '../fica/fica.service';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class WithdrawalService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly repo: Repository<Withdrawal>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly bank: BankAccountService,
    private readonly fica: FicaService,
    private readonly tx: TransactionService,
    private readonly dataSource: DataSource,
  ) {}

  async request(userId: number, amount: number): Promise<Withdrawal> {
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero.');

    const ficaApproved = await this.fica.isApproved(userId);
    if (!ficaApproved) {
      throw new ForbiddenException('FICA verification is required before withdrawing.');
    }
    const account = await this.bank.getByUser(userId);
    if (!account) throw new ForbiddenException('Add a bank account before withdrawing.');

    // Cap concurrent pending withdrawals per user. Default 3; override via
    // WITHDRAWAL_PENDING_CAP. Prevents a user from flooding the admin queue
    // and from holding arbitrary amounts of wallet balance in escrow.
    const cap = Number(process.env.WITHDRAWAL_PENDING_CAP ?? 3);
    const pending = await this.repo.count({ where: { userId, status: 'pending' } });
    if (pending >= cap) {
      throw new ForbiddenException(
        `You already have ${pending} pending withdrawal request${pending === 1 ? '' : 's'}; wait for review or cancel one before submitting another.`,
      );
    }

    // Atomic: re-read user balance with a write lock, deduct, save, then
    // create the withdrawal. The lock prevents two concurrent withdrawal
    // requests from both reading the original balance and both writing
    // `balance - amount` (finding C3 sibling).
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('User not found.');
      const balance = Number(user.walletBalance);
      if (amount > balance) {
        throw new BadRequestException(`Insufficient balance (you have ${balance.toFixed(4)}).`);
      }
      user.walletBalance = parseFloat((balance - amount).toFixed(4));
      await manager.save(user);

      const w = manager.create(Withdrawal, {
        userId,
        amount: parseFloat(amount.toFixed(4)),
        status: 'pending',
        bankAccountSnapshot: {
          country: account.country ?? null,
          bankName: account.bankName,
          accountHolder: account.accountHolder,
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          branchCode: account.branchCode ?? null,
        },
      });
      const saved = await manager.save(w);
      // Log a placeholder transaction; we use TransactionService outside the
      // manager since it has its own repository — acceptable because failure
      // here doesn't corrupt the withdrawal row (the deduction succeeded).
      // H10 bugfix: pass `manager` so the audit row commits/rolls back with
      // the wallet move atomically; drops the silent .catch which used to
      // mask audit gaps when the row failed to write.
      await this.tx.log(userId, 'WITHDRAWAL_REQUESTED', -amount, `Withdrawal #${saved.id} pending`, undefined, manager);
      return saved;
    });
  }

  async listMine(userId: number): Promise<Withdrawal[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async cancel(userId: number, id: number): Promise<Withdrawal> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the withdrawal row so an admin's concurrent `review()` can't
      // mark it paid/rejected between our status check and our save (C4).
      const w = await manager.findOne(Withdrawal, {
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w) throw new NotFoundException('Withdrawal not found.');
      if (w.status !== 'pending') {
        throw new ForbiddenException(`Only pending withdrawals can be cancelled (current: ${w.status}).`);
      }
      w.status = 'cancelled';
      w.cancelledAt = new Date();
      await manager.save(w);
      // Refund the held amount — wallet row likewise locked so the credit
      // doesn't race with a parallel withdrawal request or transfer.
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user) {
        user.walletBalance = parseFloat((Number(user.walletBalance) + Number(w.amount)).toFixed(4));
        await manager.save(user);
      }
      // H10 bugfix — see request().
      await this.tx.log(userId, 'WITHDRAWAL_CANCELLED', Number(w.amount), `Withdrawal #${w.id} cancelled — refunded`, undefined, manager);
      return w;
    });
  }

  // ─────────── Admin ───────────
  async listAll(status?: WithdrawalStatus) {
    const where = status ? { status } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async review(adminUserId: number, id: number, decision: 'paid' | 'rejected', notes?: string): Promise<Withdrawal> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the withdrawal row so a concurrent user `cancel()` (which also
      // refunds) can't race with this review and produce double-refund or a
      // paid-and-cancelled state (C4).
      const w = await manager.findOne(Withdrawal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w) throw new NotFoundException('Withdrawal not found.');
      if (w.status !== 'pending') {
        throw new ForbiddenException(`Only pending withdrawals can be reviewed (current: ${w.status}).`);
      }
      w.status = decision;
      w.reviewedBy = adminUserId;
      w.reviewedAt = new Date();
      if (notes) w.adminNotes = notes;
      await manager.save(w);

      if (decision === 'rejected') {
        // refund — lock the wallet row so the credit is atomic with any other
        // wallet operation racing this admin's click.
        const user = await manager.findOne(User, {
          where: { id: w.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (user) {
          user.walletBalance = parseFloat((Number(user.walletBalance) + Number(w.amount)).toFixed(4));
          await manager.save(user);
        }
        // H10 bugfix — see request().
        await this.tx.log(w.userId, 'WITHDRAWAL_REJECTED', Number(w.amount), `Withdrawal #${w.id} rejected — refunded${notes ? `: ${notes}` : ''}`, undefined, manager);
      } else {
        await this.tx.log(w.userId, 'WITHDRAWAL_PAID', 0, `Withdrawal #${w.id} paid to bank${notes ? ` — ${notes}` : ''}`, undefined, manager);
      }
      return w;
    });
  }
}
