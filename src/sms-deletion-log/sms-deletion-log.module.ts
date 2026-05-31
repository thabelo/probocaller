import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { SmsDeletionLog } from './sms-deletion-log.entity';
import { SmsDeletionLogService } from './sms-deletion-log.service';
import { SmsDeletionLogController } from './sms-deletion-log.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsDeletionLog]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [SmsDeletionLogController],
  providers: [SmsDeletionLogService],
  exports: [SmsDeletionLogService],
})
export class SmsDeletionLogModule {}
