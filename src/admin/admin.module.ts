import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { User } from '../user/user.entity';
import { CallLog } from '../call/call.entity';
import { Setting } from '../config/setting.entity';
import { Business } from '../business/business.entity';
import { BusinessModule } from '../business/business.module';
import { TransactionModule } from '../transaction/transaction.module';
import { PhoneReport } from '../report/phone-report.entity';
import { PhoneReportVote } from '../report/phone-report-vote.entity';
import { ReportModule } from '../report/report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CallLog, Setting, Business, PhoneReport, PhoneReportVote]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BusinessModule,
    TransactionModule,
    ReportModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
