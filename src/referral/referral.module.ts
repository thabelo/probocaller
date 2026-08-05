import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralService } from './referral.service';
import { TransactionModule } from '../transaction/transaction.module';
import { Setting } from '../config/setting.entity';

// ReferralService reads/writes the User row through the CALLER's EntityManager
// (passed into payCommission), so User needs no forFeature here — only
// TransactionService for the ledger row, and Setting for the admin-configured
// commission rate. Importing this module gives a package access to
// ReferralService without any circular dependency.
@Module({
  imports: [TransactionModule, TypeOrmModule.forFeature([Setting])],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
