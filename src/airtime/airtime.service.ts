import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AirtimePayout, AirtimeStatus } from './airtime.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { SA_NETWORKS, isSupportedNetwork, isSouthAfricanMsisdn } from './airtime.provider';

export interface RedeemAirtimeInput {
  amount: number;
  phoneNumber: string;
  network: string;
}

const round4 = (n: number) => parseFloat(n.toFixed(4));

@Injectable()
export class AirtimeService {
  constructor(
    @InjectRepository(AirtimePayout)
    private readonly repo: Repository<AirtimePayout>,
    private readonly tx: TransactionService,
    private readonly dataSource: DataSource,
  ) {}

  private get min() { return Number(process.env.AIRTIME_MIN_ZAR ?? 5); }
  private get max() { return Number(process.env.AIRTIME_MAX_ZAR ?? 1000); }

  /** Supported SA networks for the client to render a picker. */
  networks() {
    return { networks: SA_NETWORKS, min: this.min, max: this.max };
  }

  listMine(userId: number) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  /** [admin] Every request, newest first, optionally filtered by status. */
  listAll(status?: AirtimeStatus) {
    const where = status ? { status } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }

  /**
   * [admin] Resolve a queued request.
   *  - 'delivered' → the admin topped the number up manually; `reference` records
   *    the operator receipt. The debit taken at redeem() stands.
   *  - 'failed'    → refund the reserved amount and record why.
   *
   * The payout row is locked for the whole transaction so two admins clicking at
   * once can't both refund (or deliver-and-refund) the same request.
   */
  async review(
    adminUserId: number,
    id: number,
    decision: 'delivered' | 'failed',
    reference?: string,
  ): Promise<AirtimePayout> {
    return this.dataSource.transaction(async (manager) => {
      const payout = await manager.findOne(AirtimePayout, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payout) throw new NotFoundException('Airtime request not found.');
      if (payout.status !== 'pending') {
        throw new BadRequestException(
          `Only pending airtime requests can be reviewed (current: ${payout.status}).`,
        );
      }

      payout.status = decision;
      payout.reviewedBy = adminUserId;
      payout.reviewedAt = new Date();

      if (decision === 'delivered') {
        if (reference) payout.providerRef = reference;
        await manager.save(AirtimePayout, payout);
        await this.tx.log(
          payout.userId, 'AIRTIME_DELIVERED', 0,
          `Airtime R${payout.amount} to ${payout.phoneNumber} delivered${reference ? ` — ${reference}` : ''}`,
          undefined, manager,
        );
        return payout;
      }

      payout.failureReason = reference || 'Rejected by admin.';
      await manager.save(AirtimePayout, payout);

      const user = await manager.findOne(User, {
        where: { id: payout.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user) {
        user.walletBalance = round4(Number(user.walletBalance) + Number(payout.amount));
        await manager.save(user);
      }
      await this.tx.log(
        payout.userId, 'AIRTIME_REFUNDED', Number(payout.amount),
        `Airtime R${payout.amount} rejected — refunded: ${payout.failureReason}`,
        undefined, manager,
      );
      return payout;
    });
  }

  async redeem(userId: number, input: RedeemAirtimeInput): Promise<AirtimePayout> {
    const amount = round4(Number(input.amount));
    const network = String(input.network || '').toUpperCase();
    const phoneNumber = String(input.phoneNumber || '').replace(/[^\d+]/g, '');

    if (!isSupportedNetwork(network)) {
      throw new BadRequestException(`Unsupported network. Choose one of: ${SA_NETWORKS.map((n) => n.label).join(', ')}.`);
    }
    if (!phoneNumber) throw new BadRequestException('A recipient phone number is required.');
    // South Africa only: we can top up SA operators in ZAR and nothing else, so
    // reject a foreign line here — before the wallet is debited.
    if (!isSouthAfricanMsisdn(phoneNumber)) {
      throw new BadRequestException('Airtime is available for South African numbers only.');
    }
    if (!(amount >= this.min)) throw new BadRequestException(`Minimum airtime is R${this.min}.`);
    if (amount > this.max) throw new BadRequestException(`Maximum airtime is R${this.max}.`);

    // 1) Reserve — atomically debit the wallet and create a pending payout.
    //    The wallet row is locked so two concurrent redemptions can't both
    //    read the original balance and both write balance - amount.
    const payout = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('User not found.');
      const balance = Number(user.walletBalance);
      if (amount > balance) {
        throw new BadRequestException(`Insufficient balance (you have R${balance.toFixed(2)}).`);
      }
      user.walletBalance = round4(balance - amount);
      await manager.save(user);

      const p = manager.create(AirtimePayout, { userId, amount, phoneNumber, network, status: 'pending' });
      const saved = await manager.save(p);
      await this.tx.log(userId, 'AIRTIME_REDEEMED', -amount, `Airtime R${amount} to ${phoneNumber} (${network})`, undefined, manager);
      return saved;
    });

    // Queued for a ProboCaller admin to process. The wallet is already debited
    // (reserved) above, so the balance can't be spent twice while the request
    // waits; an admin rejection refunds it in review().
    return payout;
  }
}
