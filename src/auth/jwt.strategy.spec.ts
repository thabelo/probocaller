/**
 * Security regression — Backend C5.
 *
 * Historically `JwtStrategy` read `process.env.JWT_SECRET || 'probocaller-secret-key'`,
 * meaning if anyone ever bypassed the env validation in `app.module.ts` the entire
 * auth surface would silently fall back to a hard-coded, source-code-published secret —
 * letting an attacker mint admin JWTs at will.
 *
 * These tests force the strategy to refuse construction without a real secret.
 */

describe('JwtStrategy — security (C5)', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_SECRET;
    jest.resetModules();
  });

  it('throws when JWT_SECRET is unset (must not silently fall back to a literal)', () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();
    // We require lazily so the constructor's env read happens with the deleted var.
    const { JwtStrategy } = require('./jwt.strategy');
    expect(() => new JwtStrategy()).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is an empty string', () => {
    process.env.JWT_SECRET = '';
    jest.resetModules();
    const { JwtStrategy } = require('./jwt.strategy');
    expect(() => new JwtStrategy()).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is only whitespace', () => {
    process.env.JWT_SECRET = '   ';
    jest.resetModules();
    const { JwtStrategy } = require('./jwt.strategy');
    expect(() => new JwtStrategy()).toThrow(/JWT_SECRET/);
  });

  it('constructs successfully with a real secret', () => {
    process.env.JWT_SECRET = 'x'.repeat(64);
    jest.resetModules();
    const { JwtStrategy } = require('./jwt.strategy');
    expect(() => new JwtStrategy({ findOne: jest.fn() } as any)).not.toThrow();
  });
});

/**
 * Phase 1.6 — soft-deleted (deactivated) users must lose access immediately.
 *
 * Even when their JWT is still cryptographically valid, the strategy's
 * validate() should reject them with UnauthorizedException so a leaked
 * token from a deactivated account can't authenticate.
 */
describe('JwtStrategy — deactivated user gate', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(64); jest.resetModules(); });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it('returns the principal when the user is active', async () => {
    const { JwtStrategy } = require('./jwt.strategy');
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 7, deactivatedAt: null }) };
    const strategy = new JwtStrategy(repo);
    await expect(strategy.validate({ sub: 7, phoneNumber: '+27' })).resolves.toMatchObject({ userId: 7 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 7 }, select: ['id', 'deactivatedAt'] });
  });

  it('throws UnauthorizedException when the user is deactivated', async () => {
    const { JwtStrategy } = require('./jwt.strategy');
    const { UnauthorizedException } = require('@nestjs/common');
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 7, deactivatedAt: new Date() }) };
    const strategy = new JwtStrategy(repo);
    await expect(strategy.validate({ sub: 7 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    const { JwtStrategy } = require('./jwt.strategy');
    const { UnauthorizedException } = require('@nestjs/common');
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const strategy = new JwtStrategy(repo);
    await expect(strategy.validate({ sub: 99 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when payload has no sub (defence in depth)', async () => {
    const { JwtStrategy } = require('./jwt.strategy');
    const { UnauthorizedException } = require('@nestjs/common');
    const strategy = new JwtStrategy({ findOne: jest.fn() } as any);
    await expect(strategy.validate({})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

/**
 * Cookie auth (admin panel) — the strategy must also accept the JWT from an
 * HttpOnly `accessToken` cookie, not just the Authorization header, so the admin
 * panel can stop holding the token in JS-readable localStorage. Bearer auth
 * (mobile app) keeps working via the second extractor.
 */
describe('cookieAccessTokenExtractor', () => {
  it('reads the accessToken value from the Cookie header', () => {
    const { cookieAccessTokenExtractor } = require('./jwt.strategy');
    const req = { headers: { cookie: 'foo=bar; accessToken=abc.def.ghi; other=1' } };
    expect(cookieAccessTokenExtractor(req)).toBe('abc.def.ghi');
  });

  it('returns null when no cookie header or no accessToken cookie is present', () => {
    const { cookieAccessTokenExtractor } = require('./jwt.strategy');
    expect(cookieAccessTokenExtractor({ headers: {} })).toBeNull();
    expect(cookieAccessTokenExtractor({ headers: { cookie: 'foo=bar' } })).toBeNull();
    expect(cookieAccessTokenExtractor({})).toBeNull();
  });
});
