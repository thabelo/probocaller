import { UnauthorizedException } from '@nestjs/common';
import { assertPasswordlessLoginAllowed, isPasswordlessLoginAllowed } from './passwordless-login';

/**
 * The interim gate for credential-less login.
 *
 * Login mints a session from a phone number ALONE — no OTP, no password — so
 * anyone who knows a number takes over the account, and an admin number is a
 * full admin takeover. Until one-time-code verification is built, that must not
 * reach production. The gate closes it there and nowhere else, so local work
 * and e2e are unaffected.
 */
describe('isPasswordlessLoginAllowed', () => {
  it('refuses in production — no flag can re-enable it', () => {
    expect(isPasswordlessLoginAllowed('production')).toBe(false);
  });

  it('allows everywhere else, so dev, test and staging keep working', () => {
    expect(isPasswordlessLoginAllowed('development')).toBe(true);
    expect(isPasswordlessLoginAllowed('test')).toBe(true);
    expect(isPasswordlessLoginAllowed('staging')).toBe(true);
  });

  it('throws an UnauthorizedException in production, pointing at the reason', () => {
    expect(() => assertPasswordlessLoginAllowed('production')).toThrow(UnauthorizedException);
    expect(() => assertPasswordlessLoginAllowed('production')).toThrow(/one-time-code|verification/i);
  });

  it('does not throw outside production', () => {
    expect(() => assertPasswordlessLoginAllowed('development')).not.toThrow();
  });
});
