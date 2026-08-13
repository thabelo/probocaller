import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { SettingsReaderService } from './settings-reader.service';
import { seedSettings } from './seed-settings';

/**
 * Injection token proving the bootstrap settings rows exist.
 *
 * Any provider that reads a setting during INSTANTIATION (an async
 * `useFactory`, not a request-time call) must inject this, because
 * SettingsReaderService throws on a missing row and instantiation happens
 * strictly before `onModuleInit` — where seeding used to live. Depending on
 * this token makes the ordering a DI guarantee instead of a lifecycle
 * assumption. See UserModule's ExternalLookupRateLimiter.
 */
export const SETTINGS_SEEDED = 'SETTINGS_SEEDED';

/**
 * Shared home for the `settings` table reader. Any module that needs a
 * money-affecting admin-configurable rate (RATE_PER_SECOND, PLATFORM_CUT_RATE,
 * SMS_RATE_PER_MESSAGE, PAY_TO_CONTACT_FEE_RATE, …) imports this module and
 * injects SettingsReaderService, instead of keeping its own duplicated
 * `DEFAULT_x` fallback constant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  providers: [
    SettingsReaderService,
    {
      provide: SETTINGS_SEEDED,
      useFactory: async (settingRepository: Repository<Setting>) => {
        await seedSettings(settingRepository);
        return true;
      },
      inject: [getRepositoryToken(Setting)],
    },
  ],
  exports: [SettingsReaderService, SETTINGS_SEEDED],
})
export class ConfigModule {}
