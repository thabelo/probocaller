import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
