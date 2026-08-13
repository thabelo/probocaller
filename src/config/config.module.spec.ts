import 'reflect-metadata';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule, SETTINGS_SEEDED } from './config.module';
import { SettingsReaderService } from './settings-reader.service';
import { Setting } from './setting.entity';
import { DEFAULT_SETTINGS } from './seed-settings';

/**
 * The ordering fix for the boot crash-loop.
 *
 * Bootstrap seeding used to run in AppModule.onModuleInit(), which Nest calls
 * only AFTER every provider is instantiated — but UserModule's
 * ExternalLookupRateLimiter is built by an async useFactory that READS
 * settings during instantiation. A database missing either external-lookup row
 * therefore threw before seeding could ever run, and no restart could fix it.
 *
 * SETTINGS_SEEDED is an async provider that performs the seed. Anything that
 * reads settings at instantiation time injects this token, which makes "the
 * rows exist" a DI dependency rather than a hope about lifecycle order.
 */
describe('ConfigModule — SETTINGS_SEEDED', () => {
  const providerFor = (token: unknown) =>
    (Reflect.getMetadata('providers', ConfigModule) || []).find((p: any) => p?.provide === token);

  it('exports the seeded token alongside the reader', () => {
    const exports = Reflect.getMetadata('exports', ConfigModule) || [];
    expect(exports).toEqual(expect.arrayContaining([SettingsReaderService, SETTINGS_SEEDED]));
  });

  it('seeds from the Setting repository via an async factory', async () => {
    const provider = providerFor(SETTINGS_SEEDED);
    expect(provider).toBeDefined();
    expect(provider.inject).toEqual([getRepositoryToken(Setting)]);

    const saved: any[] = [];
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => { saved.push(d); return d; }),
    };

    await provider.useFactory(repo);

    expect(saved.map((s) => s.key)).toEqual(
      expect.arrayContaining(DEFAULT_SETTINGS.map((d) => d.key)),
    );
  });
});
