import 'reflect-metadata';

/**
 * UserController now injects ReferralService (GET /user/rate reads the
 * referral commission rate through ReferralService.getCommissionRate(),
 * rather than duplicating the settings parse). UserModule pulls in a large
 * real dependency graph (BusinessModule, DataBrokerModule, …) that needs a
 * live DataSource to actually compile, so — same pattern as
 * business.module.spec.ts / sms-log.module.spec.ts — this verifies the
 * wiring declaratively via metadata instead of a full DI compile.
 *
 * user.module.ts re-exports JWT_SECRET from app.module.ts, which — at IMPORT
 * time — eagerly evaluates every requireEnv() call baked into its
 * TypeOrmModule.forRoot() config object (DB_HOST/DB_PORT/DB_USER/…), not just
 * JWT_SECRET. require() (not import) so this runs after the env vars below
 * are set, restoring whatever was there before on teardown.
 */
describe('UserModule wiring', () => {
  const REQUIRED_KEYS = ['JWT_SECRET', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const originals: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of REQUIRED_KEYS) originals[key] = process.env[key];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      process.env.JWT_SECRET = 'a'.repeat(64);
    }
    process.env.DB_HOST ||= 'localhost';
    process.env.DB_PORT ||= '5432';
    process.env.DB_USER ||= 'test';
    process.env.DB_PASSWORD ||= 'test';
    process.env.DB_NAME ||= 'test';
  });

  afterAll(() => {
    for (const key of REQUIRED_KEYS) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  });

  it('declares both controllers and imports ReferralModule + ConfigModule', () => {
    const { UserModule } = require('./user.module');
    const { UserController } = require('./user.controller');
    const { AvatarController } = require('./avatar.controller');
    const { ReferralModule } = require('../referral/referral.module');
    const { ConfigModule } = require('../config/config.module');

    const imports = Reflect.getMetadata('imports', UserModule) || [];
    const controllers = Reflect.getMetadata('controllers', UserModule) || [];

    expect(controllers).toEqual(expect.arrayContaining([UserController, AvatarController]));
    expect(imports).toEqual(expect.arrayContaining([ReferralModule, ConfigModule]));
  });

  /**
   * ExternalLookupRateLimiter.tryAcquire() runs on the caller-ID hot path and
   * must stay fully synchronous, so it can't read the admin-configured
   * EXTERNAL_LOOKUP_MAX_PER_WINDOW / EXTERNAL_LOOKUP_WINDOW_MS settings
   * per-call. Instead, its CONSTRUCTION is async: an async `useFactory`
   * resolves both live from SettingsReaderService at module-init time
   * (before the app serves any request) and passes them in explicitly.
   *
   * It must ALSO inject SETTINGS_SEEDED. Instantiation runs strictly before
   * onModuleInit, where bootstrap seeding used to live, so a database missing
   * either row threw here and crash-looped with no way to seed itself — that
   * is the 12 Aug 2026 outage. Depending on the token orders the seed ahead of
   * the read.
   */
  it('constructs ExternalLookupRateLimiter from live settings via an async factory', async () => {
    const { UserModule } = require('./user.module');
    const { ExternalLookupRateLimiter } = require('./external-lookup-rate-limiter');
    const { SettingsReaderService } = require('../config/settings-reader.service');
    const { SETTINGS_SEEDED } = require('../config/config.module');

    const providers = Reflect.getMetadata('providers', UserModule) || [];
    const limiterProvider = providers.find((p: any) => p?.provide === ExternalLookupRateLimiter);
    expect(limiterProvider).toBeDefined();
    expect(typeof limiterProvider.useFactory).toBe('function');
    expect(limiterProvider.inject).toEqual([SettingsReaderService, SETTINGS_SEEDED]);

    const settingsReader = {
      getNumber: jest.fn().mockImplementation(async (key: string) =>
        key === 'EXTERNAL_LOOKUP_MAX_PER_WINDOW' ? 2
          : key === 'EXTERNAL_LOOKUP_WINDOW_MS' ? 1000
          : Promise.reject(new Error(`unexpected key: ${key}`))),
    };
    const limiter = await limiterProvider.useFactory(settingsReader, true);

    expect(limiter).toBeInstanceOf(ExternalLookupRateLimiter);
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.tryAcquire('u')).toBe(false); // 3rd exceeds the configured max of 2
  });
});
