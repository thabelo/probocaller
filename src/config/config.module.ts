import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from './setting.entity';
import { SettingsReaderService } from './settings-reader.service';

/**
 * Shared home for the `settings` table reader. Any module that needs a
 * money-affecting admin-configurable rate (RATE_PER_SECOND, PLATFORM_CUT_RATE,
 * SMS_RATE_PER_MESSAGE, PAY_TO_CONTACT_FEE_RATE, …) imports this module and
 * injects SettingsReaderService, instead of keeping its own duplicated
 * `DEFAULT_x` fallback constant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  providers: [SettingsReaderService],
  exports: [SettingsReaderService],
})
export class ConfigModule {}
