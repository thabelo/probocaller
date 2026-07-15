import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileField } from './profile-field.entity';
import { UserProfile } from './user-profile.entity';
import { DataAccessLog } from './data-access-log.entity';
import { DataCertificate } from './data-certificate.entity';
import { BusinessAudience } from './business-audience.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Setting } from '../config/setting.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfileField, UserProfile, DataAccessLog, DataCertificate, BusinessAudience, User, Business, Transaction, Setting]),
    ReferralModule,
  ],
  providers: [ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService],
})
export class ProfileModule {}
