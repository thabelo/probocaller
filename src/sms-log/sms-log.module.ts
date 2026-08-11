import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { SmsLog } from './sms-log.entity';
import { SmsLogService } from './sms-log.service';
import { SmsLogController } from './sms-log.controller';
import { AdminSmsLogController } from './admin-sms-log.controller';
import { AdminSmsLogsController } from './admin-sms-logs.controller';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';
import { BusinessModule } from '../business/business.module';
import { ReferralModule } from '../referral/referral.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsLog, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BusinessModule,
    ReferralModule,
    TransactionModule,
    ConfigModule,
  ],
  controllers: [SmsLogController, AdminSmsLogController, AdminSmsLogsController],
  providers: [SmsLogService, AdminGuard],
  exports: [SmsLogService],
})
export class SmsLogModule {}
