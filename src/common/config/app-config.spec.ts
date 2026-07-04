import { resolveAppConfig } from './app-config';

describe('resolveAppConfig', () => {
  it('detects the environment from NODE_ENV (incl. common aliases)', () => {
    expect(resolveAppConfig({ NODE_ENV: 'production' }).environment).toBe('production');
    expect(resolveAppConfig({ NODE_ENV: 'prod' }).environment).toBe('production');
    expect(resolveAppConfig({ NODE_ENV: 'staging' }).environment).toBe('staging');
    expect(resolveAppConfig({ NODE_ENV: 'stage' }).environment).toBe('staging');
    expect(resolveAppConfig({ NODE_ENV: 'test' }).environment).toBe('test');
    expect(resolveAppConfig({ NODE_ENV: 'development' }).environment).toBe('development');
    expect(resolveAppConfig({}).environment).toBe('development'); // safe default
  });

  it('exposes boolean flags for the active environment', () => {
    const prod = resolveAppConfig({ NODE_ENV: 'production' });
    expect(prod.isProduction).toBe(true);
    expect(prod.isStaging).toBe(false);
    expect(prod.isDevelopment).toBe(false);
  });

  it('enables docs in dev/staging but not production, unless ENABLE_DOCS overrides', () => {
    expect(resolveAppConfig({ NODE_ENV: 'development' }).enableDocs).toBe(true);
    expect(resolveAppConfig({ NODE_ENV: 'staging' }).enableDocs).toBe(true);
    expect(resolveAppConfig({ NODE_ENV: 'production' }).enableDocs).toBe(false);
    expect(resolveAppConfig({ NODE_ENV: 'production', ENABLE_DOCS: 'true' }).enableDocs).toBe(true);
    expect(resolveAppConfig({ NODE_ENV: 'development', ENABLE_DOCS: 'false' }).enableDocs).toBe(false);
  });

  it('defaults log level to info in production and debug elsewhere, overridable', () => {
    expect(resolveAppConfig({ NODE_ENV: 'production' }).logLevel).toBe('info');
    expect(resolveAppConfig({ NODE_ENV: 'development' }).logLevel).toBe('debug');
    expect(resolveAppConfig({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).logLevel).toBe('warn');
  });

  it('parses port (default 3000) and CORS origins', () => {
    expect(resolveAppConfig({}).port).toBe(3000);
    expect(resolveAppConfig({ PORT: '8080' }).port).toBe(8080);
    expect(resolveAppConfig({ CORS_ORIGINS: 'http://a.com, http://b.com ' }).corsOrigins)
      .toEqual(['http://a.com', 'http://b.com']);
    expect(resolveAppConfig({}).corsOrigins).toEqual([]);
  });
});
