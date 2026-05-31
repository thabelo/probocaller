import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';

@Module({
  controllers: [BanksController],
})
export class BanksModule {}
