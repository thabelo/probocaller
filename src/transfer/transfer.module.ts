import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../user/user.entity';
import { PendingTransfer } from './pending-transfer.entity';
import { Transaction } from '../transaction/transaction.entity';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction, PendingTransfer]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [TransferController],
  providers: [TransferService],
  // Exported so signup can claim money held before the user existed.
  exports: [TransferService],
})
export class TransferModule {}
