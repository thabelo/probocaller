import { shouldRunMigrations } from './should-run-migrations';

describe('shouldRunMigrations', () => {
  it('returns true in production', () => {
    expect(shouldRunMigrations({ NODE_ENV: 'production' })).toBe(true);
  });

  it('returns false in development by default', () => {
    expect(shouldRunMigrations({ NODE_ENV: 'development' })).toBe(false);
    expect(shouldRunMigrations({})).toBe(false);
  });

  it('returns true when RUN_MIGRATIONS is explicitly truthy, regardless of NODE_ENV', () => {
    expect(shouldRunMigrations({ NODE_ENV: 'development', RUN_MIGRATIONS: 'true' })).toBe(true);
    expect(shouldRunMigrations({ NODE_ENV: 'test', RUN_MIGRATIONS: '1' })).toBe(true);
  });

  it('returns false when RUN_MIGRATIONS is explicitly falsy in production (escape hatch)', () => {
    expect(shouldRunMigrations({ NODE_ENV: 'production', RUN_MIGRATIONS: 'false' })).toBe(false);
    expect(shouldRunMigrations({ NODE_ENV: 'production', RUN_MIGRATIONS: '0' })).toBe(false);
  });

  it('ignores unparseable RUN_MIGRATIONS and falls back to NODE_ENV', () => {
    expect(shouldRunMigrations({ NODE_ENV: 'production', RUN_MIGRATIONS: 'maybe' })).toBe(true);
    expect(shouldRunMigrations({ NODE_ENV: 'development', RUN_MIGRATIONS: 'maybe' })).toBe(false);
  });
});
