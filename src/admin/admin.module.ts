import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminInvite } from './admin-invite.entity';
import { AdminInviteService } from './admin-invite.service';
import { AdminInviteController } from './admin-invite.controller';
import { User } from '../user/user.entity';
import { CallLog } from '../call/call.entity';
import { Setting } from '../config/setting.entity';
import { Business } from '../business/business.entity';
import { BusinessModule } from '../business/business.module';
import { TransactionModule } from '../transaction/transaction.module';
import { PhoneReport } from '../report/phone-report.entity';
import { PhoneReportVote } from '../report/phone-report-vote.entity';
import { ReportModule } from '../report/report.module';
import { AuditModule } from '../audit/audit.module';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CallLog, Setting, Business, PhoneReport, PhoneReportVote, AdminInvite]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BusinessModule,
    TransactionModule,
    ReportModule,
    AuditModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: (process.env.JWT_ACCESS_EXPIRES || '7d') as any },
      }),
    }),
  ],
  controllers: [AdminController, AdminInviteController, AdminAuthController],
  providers: [AdminService, AdminGuard, AdminInviteService],
  exports: [AdminService],
})
export class AdminModule {}
