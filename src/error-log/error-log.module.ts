import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { ErrorLog } from './error-log.entity';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ErrorLog, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ErrorLogController],
  providers: [ErrorLogService, AdminGuard],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
