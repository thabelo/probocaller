import { Module } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { TransactionModule } from '../transaction/transaction.module';

// ReferralService reads/writes the User row through the CALLER's EntityManager
// (passed into payCommission), so it needs no TypeOrmModule.forFeature here —
// only TransactionService for the ledger row. Importing this module gives a
// package access to ReferralService without any circular dependency.
@Module({
  imports: [TransactionModule],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
