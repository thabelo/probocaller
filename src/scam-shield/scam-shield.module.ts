import { Module } from '@nestjs/common';
import { LookupModule } from '../lookup/lookup.module';
import { ScamShieldController } from './scam-shield.controller';
import { ScamShieldService } from './scam-shield.service';

@Module({
  imports: [LookupModule],
  controllers: [ScamShieldController],
  providers: [ScamShieldService],
  exports: [ScamShieldService],
})
export class ScamShieldModule {}
