import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AirtimePayout } from './airtime.entity';
import { User } from '../user/user.entity';
import { AirtimeService } from './airtime.service';
import { AirtimeController } from './airtime.controller';
import { AIRTIME_PROVIDER, ReloadlyAirtimeProvider } from './airtime.provider';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AirtimePayout, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TransactionModule,
  ],
  controllers: [AirtimeController],
  providers: [
    AirtimeService,
    { provide: AIRTIME_PROVIDER, useClass: ReloadlyAirtimeProvider },
  ],
  exports: [AirtimeService],
})
export class AirtimeModule {}
