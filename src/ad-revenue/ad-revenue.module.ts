import { Module } from '@nestjs/common';
import { AdRevenueService } from './ad-revenue.service';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

// AdRevenueService reads/writes the User row through the CALLER's EntityManager
// (passed into payShare), so User needs no forFeature here — only
// TransactionService for the ledger row, and the shared ConfigModule for the
// admin-configured share rate (via SettingsReaderService). Mirrors
// ReferralModule; importing this gives a package AdRevenueService with no
// circular dependency.
@Module({
  imports: [TransactionModule, ConfigModule],
  providers: [AdRevenueService],
  exports: [AdRevenueService],
})
export class AdRevenueModule {}
