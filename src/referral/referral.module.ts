import { Module } from '@nestjs/common';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

// ReferralService reads/writes the User row through the CALLER's EntityManager
// (passed into payCommission), so User needs no forFeature here — only
// TransactionService for the ledger row, and the shared ConfigModule for the
// admin-configured commission rate (via SettingsReaderService). Importing this
// module gives a package access to ReferralService without any circular
// dependency.
@Module({
  imports: [TransactionModule, ConfigModule],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
