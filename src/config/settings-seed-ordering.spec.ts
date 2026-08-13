import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from './config.module';
import { Setting } from './setting.entity';

/**
 * Regression test for the 12 Aug 2026 outage.
 *
 * A fresh database has no `settings` rows. UserModule builds
 * ExternalLookupRateLimiter from an async useFactory that reads two of them,
 * and Nest resolves async factories during provider INSTANTIATION — before
 * onModuleInit, where AdminService.seedDefaultConfig() used to be the only
 * seeder. So boot threw "Missing or invalid setting:
 * EXTERNAL_LOOKUP_MAX_PER_WINDOW", never reached onModuleInit, and no restart
 * could ever fix it; the rows had to be inserted by hand.
 *
 * This compiles the real provider definition against an EMPTY in-memory
 * settings table and asserts the limiter comes up anyway — which is only true
 * while the limiter depends on SETTINGS_SEEDED.
 */
describe('settings seeding runs before providers that read settings', () => {
  /**
   * user.module.ts re-exports JWT_SECRET from app.module.ts, whose module-level
   * requireEnv() calls evaluate at IMPORT time — so it must be require()d after
   * these are set, and they're restored on teardown. Same dance as
   * user.module.spec.ts.
   */
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

  /** Minimal in-memory stand-in for the Setting repository, starting empty. */
  const makeRepo = () => {
    const rows = new Map<string, Setting>();
    return {
      rows,
      findOne: async ({ where: { key } }: any) => rows.get(key) ?? null,
      create: (d: any) => d,
      save: async (d: any) => { rows.set(d.key, d); return d; },
    };
  };

  it('constructs ExternalLookupRateLimiter against an empty settings table', async () => {
    const { UserModule } = require('../user/user.module');
    const { ExternalLookupRateLimiter } = require('../user/external-lookup-rate-limiter');
    const repo = makeRepo();

    // The limiter's own provider definition, resolved through the real
    // ConfigModule — the same graph boot walks.
    const limiterProvider = (Reflect.getMetadata('providers', UserModule) || [])
      .find((p: any) => p?.provide === ExternalLookupRateLimiter);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [limiterProvider],
    })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue(repo)
      .compile();

    expect(moduleRef.get(ExternalLookupRateLimiter)).toBeInstanceOf(ExternalLookupRateLimiter);
    expect(repo.rows.get('EXTERNAL_LOOKUP_MAX_PER_WINDOW')?.value).toBe('15');
    expect(repo.rows.get('EXTERNAL_LOOKUP_WINDOW_MS')?.value).toBe('60000');
  });
});
