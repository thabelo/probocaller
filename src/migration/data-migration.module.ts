import { Module } from '@nestjs/common';
import { DataMigrationService } from './data-migration.service';

@Module({
  providers: [DataMigrationService],
  exports: [DataMigrationService],
})
export class DataMigrationModule {}
