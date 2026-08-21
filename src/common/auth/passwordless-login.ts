import { UnauthorizedException } from '@nestjs/common';
import { Environment } from '../config/app-config';

/**
 * Gate for the credential-less login endpoints — POST /auth/login,
 * POST /admin/auth/login, and the mobile /user/login — which mint a session
 * from a phone number ALONE. No OTP, no password, no secret of any kind is
 * checked: the login bodies do not even carry one.
 *
 * That is an authentication bypass. Anyone who knows (or guesses) a phone
 * number takes over the account; an admin number is a full admin takeover.
 * Until one-time-code verification is built, this must not reach production.
 *
 * The rule is deliberately stricter than the wallet-faucet gate it echoes.
 * The faucet allows an opt-in flag outside prod; login does NOT get one,
 * because there is no environment where credential-less auth in PRODUCTION is
 * acceptable, and a flag flippable in prod is the same bypass with an extra
 * step. So: refused outright in production, allowed everywhere else, so local
 * development and the e2e suite are unaffected.
 *
 * This is the INTERIM that stops the bypass shipping; it does not add the OTP.
 * When one-time-code verification lands, this gate is deleted and login
 * verifies a real code in every environment.
 */
export function isPasswordlessLoginAllowed(environment: Environment): boolean {
  return environment !== 'production';
}

export function assertPasswordlessLoginAllowed(environment: Environment): void {
  if (isPasswordlessLoginAllowed(environment)) return;
  throw new UnauthorizedException(
    'Sign-in is unavailable: phone-number-only login is disabled in production ' +
      'until one-time-code verification is connected.',
  );
}
