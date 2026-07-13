import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { BusinessModule } from '../business/business.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { GooglePlacesLookupService, NUMBER_INTELLIGENCE } from './google-places-lookup.service';
import { ReverseLookupService } from './reverse-lookup.service';
import { ReverseLookupEvent } from './reverse-lookup-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, ReverseLookupEvent]), BusinessModule, SuppressionModule],
  controllers: [LookupController],
  providers: [
    LookupService,
    ReverseLookupService,
    GooglePlacesLookupService,
    { provide: NUMBER_INTELLIGENCE, useExisting: GooglePlacesLookupService },
  ],
  exports: [LookupService, ReverseLookupService],
})
export class LookupModule {}
