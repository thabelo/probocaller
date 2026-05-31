import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Withdrawal } from '../withdrawal/withdrawal.entity';
import { BankAccount } from '../bank-account/bank-account.entity';
import { UserProfile } from '../profile/user-profile.entity';

export interface GdprExport {
  schemaVersion: 1;
  generatedAt: string;
  user: User;
  bankAccount: BankAccount | null;
  profile: UserProfile | null;
  transactions: Transaction[];
  withdrawals: Withdrawal[];
}

@Injectable()
export class GdprService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    @InjectRepository(Withdrawal) private readonly withdrawals: Repository<Withdrawal>,
    @InjectRepository(BankAccount) private readonly bankAccounts: Repository<BankAccount>,
    @InjectRepository(UserProfile) private readonly profiles: Repository<UserProfile>,
  ) {}

  async exportForUser(userId: number): Promise<GdprExport> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [transactions, withdrawals, bankAccount, profile] = await Promise.all([
      this.transactions.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.withdrawals.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.bankAccounts.findOne({ where: { userId } }),
      this.profiles.findOne({ where: { userId } }),
    ]);

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      user,
      bankAccount,
      profile,
      transactions,
      withdrawals,
    };
  }
}
