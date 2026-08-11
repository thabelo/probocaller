import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Withdrawal } from './withdrawal.entity';
import { User } from '../user/user.entity';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalController } from './withdrawal.controller';
import { AdminWithdrawalController } from './admin-withdrawal.controller';
import { AdminGuard } from '../admin/admin.guard';
import { BankAccountModule } from '../bank-account/bank-account.module';
import { FicaModule } from '../fica/fica.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Withdrawal, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BankAccountModule,
    FicaModule,
    TransactionModule,
    ConfigModule,
  ],
  controllers: [WithdrawalController, AdminWithdrawalController],
  providers: [WithdrawalService, AdminGuard],
  exports: [WithdrawalService],
})
export class WithdrawalModule {}
