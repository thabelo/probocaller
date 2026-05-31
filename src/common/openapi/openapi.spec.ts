import { buildSwaggerConfig, shouldExposeDocsUi } from './openapi';

describe('buildSwaggerConfig', () => {
  it('produces a config with title, version, and bearer auth', () => {
    const cfg = buildSwaggerConfig() as any;
    expect(cfg.info.title).toBe('Probocaller API');
    expect(cfg.info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(cfg.components.securitySchemes).toEqual(
      expect.objectContaining({
        bearer: expect.objectContaining({ type: 'http', scheme: 'bearer' }),
      }),
    );
  });
});

describe('shouldExposeDocsUi', () => {
  it('exposes docs when NODE_ENV is not production', () => {
    expect(shouldExposeDocsUi({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldExposeDocsUi({ NODE_ENV: 'test' })).toBe(true);
    expect(shouldExposeDocsUi({})).toBe(true);
  });

  it('does NOT expose docs in production by default', () => {
    expect(shouldExposeDocsUi({ NODE_ENV: 'production' })).toBe(false);
  });

  it('exposes docs in production when ENABLE_DOCS is explicitly truthy', () => {
    expect(shouldExposeDocsUi({ NODE_ENV: 'production', ENABLE_DOCS: 'true' })).toBe(true);
    expect(shouldExposeDocsUi({ NODE_ENV: 'production', ENABLE_DOCS: '1' })).toBe(true);
  });

  it('ignores truthy-looking but falsy ENABLE_DOCS values', () => {
    expect(shouldExposeDocsUi({ NODE_ENV: 'production', ENABLE_DOCS: 'false' })).toBe(false);
    expect(shouldExposeDocsUi({ NODE_ENV: 'production', ENABLE_DOCS: '0' })).toBe(false);
    expect(shouldExposeDocsUi({ NODE_ENV: 'production', ENABLE_DOCS: '' })).toBe(false);
  });
});
