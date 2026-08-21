import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { CallLog } from '../call/call.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { ProfileChangeLog } from '../profile/profile-change-log.entity';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';
import { DataRetentionService } from './data-retention.service';
import { RetentionController } from './retention.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallLog, AuditLog, User, ProfileChangeLog]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [RetentionController],
  providers: [DataRetentionService, AdminGuard],
  exports: [DataRetentionService],
})
export class RetentionModule {}
