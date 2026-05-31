import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallLog } from './call.entity';
import { CallRating } from './call-rating.entity';
import { CallService } from './call.service';
import { CallController, CallAliasController } from './call.controller';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Setting } from '../config/setting.entity';
import { TransactionModule } from '../transaction/transaction.module';
import { DataBrokerModule } from '../data-broker/data-broker.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallLog, CallRating, User, Business, Setting]),
    TransactionModule,
    DataBrokerModule,
  ],
  controllers: [CallController, CallAliasController],
  providers: [CallService],
  exports: [CallService],
})
export class CallModule {}
