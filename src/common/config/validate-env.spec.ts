import { validateEnv } from './validate-env';

const validEnv = (over: Record<string, string> = {}) => ({
  JWT_SECRET: 'x'.repeat(64),
  JWT_REFRESH_SECRET: 'y'.repeat(64),
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'probo',
  DB_PASSWORD: 'a-strong-db-password',
  DB_NAME: 'probocaller',
  NODE_ENV: 'production',
  ...over,
});

describe('validateEnv', () => {
  it('passes for a complete, strong production env', () => {
    expect(() => validateEnv(validEnv())).not.toThrow();
  });

  it('throws listing every missing required variable', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' } as any)).toThrow(/JWT_SECRET[\s\S]*DB_PASSWORD/);
  });

  it('rejects a JWT_SECRET shorter than 32 chars', () => {
    expect(() => validateEnv(validEnv({ JWT_SECRET: 'short' }))).toThrow(/JWT_SECRET.*32/);
  });

  it('rejects placeholder secrets in production', () => {
    expect(() => validateEnv(validEnv({ JWT_SECRET: 'replace_with_128_char_hex_secret'.padEnd(40, '0') })))
      .toThrow(/insecure placeholder|default/i);
  });

  it('rejects a weak/default DB_PASSWORD in production', () => {
    expect(() => validateEnv(validEnv({ DB_PASSWORD: 'root' }))).toThrow(/DB_PASSWORD/);
  });

  it('allows weak values outside production (dev convenience) but still requires presence', () => {
    expect(() => validateEnv(validEnv({ NODE_ENV: 'development', DB_PASSWORD: 'root' }))).not.toThrow();
    expect(() => validateEnv({ NODE_ENV: 'development' } as any)).toThrow(/Missing/);
  });
});
