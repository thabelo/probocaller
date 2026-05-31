import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Withdrawal } from '../withdrawal/withdrawal.entity';
import { BankAccount } from '../bank-account/bank-account.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Transaction, Withdrawal, BankAccount, UserProfile])],
  providers: [GdprService],
  controllers: [GdprController],
})
export class GdprModule {}
