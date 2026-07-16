import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../config/setting.entity';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  providers: [FxService],
  controllers: [FxController],
  exports: [FxService],
})
export class FxModule {}
