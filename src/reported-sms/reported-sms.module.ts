import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { ReportedSms } from './reported-sms.entity';
import { ReportedSmsService } from './reported-sms.service';
import { ReportedSmsController } from './reported-sms.controller';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportedSms, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ReportedSmsController],
  providers: [ReportedSmsService, AdminGuard],
  exports: [ReportedSmsService],
})
export class ReportedSmsModule {}
