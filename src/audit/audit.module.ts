import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuditController],
  providers: [AuditService, AdminGuard],
  exports: [AuditService],
})
export class AuditModule {}
