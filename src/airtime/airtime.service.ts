import {
  BadRequestException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AirtimePayout } from './airtime.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { AIRTIME_PROVIDER, AirtimeProvider, SA_NETWORKS, isSupportedNetwork } from './airtime.provider';

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
    @Inject(AIRTIME_PROVIDER)
    private readonly provider: AirtimeProvider,
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

  async redeem(userId: number, input: RedeemAirtimeInput): Promise<AirtimePayout> {
    const amount = round4(Number(input.amount));
    const network = String(input.network || '').toUpperCase();
    const phoneNumber = String(input.phoneNumber || '').replace(/[^\d+]/g, '');

    if (!isSupportedNetwork(network)) {
      throw new BadRequestException(`Unsupported network. Choose one of: ${SA_NETWORKS.map((n) => n.label).join(', ')}.`);
    }
    if (!phoneNumber) throw new BadRequestException('A recipient phone number is required.');
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

    // 2) Fulfil via the external provider — outside the DB lock so we never
    //    hold a row lock across a network call.
    try {
      const result = await this.provider.sendAirtime({ phoneNumber, amount, network });
      payout.status = result.status === 'delivered' ? 'delivered' : 'pending';
      payout.providerRef = result.providerRef;
      await this.repo.save(payout);
      return payout;
    } catch (err: any) {
      // 3) Provider failed → refund the reserved amount and mark the payout failed.
      const reason = err?.message || 'Airtime provider error.';
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        if (user) {
          user.walletBalance = round4(Number(user.walletBalance) + amount);
          await manager.save(user);
        }
        payout.status = 'failed';
        payout.failureReason = reason;
        await manager.save(AirtimePayout, payout);
        await this.tx.log(userId, 'AIRTIME_REFUNDED', amount, `Airtime R${amount} failed — refunded`, undefined, manager);
      });
      throw new BadRequestException(`Airtime top-up failed: ${reason} Your balance was refunded.`);
    }
  }
}
