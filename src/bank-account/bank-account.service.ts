import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from './bank-account.entity';

export interface BankAccountInput {
  country?: string;        // ISO 3166-1 alpha-2
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType?: string;
  branchCode?: string;
}

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly repo: Repository<BankAccount>,
  ) {}

  async getByUser(userId: number): Promise<BankAccount | null> {
    return this.repo.findOne({ where: { userId } });
  }

  /** Upsert: create if not exists, else update.  One bank account per user. */
  async upsert(userId: number, input: BankAccountInput): Promise<BankAccount> {
    let row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      row = this.repo.create({ userId, ...input, accountType: input.accountType ?? 'cheque' });
    } else {
      if (input.country !== undefined) row.country = input.country;
      row.bankName = input.bankName;
      row.accountHolder = input.accountHolder;
      row.accountNumber = input.accountNumber;
      if (input.accountType) row.accountType = input.accountType;
      row.branchCode = input.branchCode ?? null;
    }
    return this.repo.save(row);
  }

  async remove(userId: number): Promise<{ deleted: boolean }> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) throw new NotFoundException('No bank account on file');
    await this.repo.remove(row);
    return { deleted: true };
  }
}
