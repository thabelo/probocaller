import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayToContactService } from './pay-to-contact.service';
import { CallPermissionRequest } from '../data-broker/call-permission-request.entity';
import { User } from '../user/user.entity';
import { TransactionModule } from '../transaction/transaction.module';
import { ReferralModule } from '../referral/referral.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallPermissionRequest, User]),
    TransactionModule,
    ReferralModule,
    ConfigModule,
  ],
  providers: [PayToContactService],
  exports: [PayToContactService],
})
export class PayToContactModule {}
