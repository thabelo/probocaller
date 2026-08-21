import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileField } from './profile-field.entity';
import { UserProfile } from './user-profile.entity';
import { DataAccessLog } from './data-access-log.entity';
import { ProfileChangeLog } from './profile-change-log.entity';
import { ProfileHistoryService } from './profile-history.service';
import { ProfileNudgeService } from './profile-nudge.service';
import { DataCertificate } from './data-certificate.entity';
import { BusinessAudience } from './business-audience.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Transaction } from '../transaction/transaction.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ReferralModule } from '../referral/referral.module';
import { ConfigModule } from '../config/config.module';
import { PushModule } from '../push/push.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfileField, UserProfile, DataAccessLog, ProfileChangeLog, DataCertificate, BusinessAudience, User, Business, Transaction]),
    ReferralModule,
    // The staleness sweep asks people whether anything has changed.
    PushModule,
    ConfigModule,
    // Supplies AppAccessGuard + its dependencies for the @RequiresApp routes.
    MarketplaceModule,
  ],
  providers: [ProfileNudgeService, ProfileHistoryService, ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService],
})
export class ProfileModule {}
