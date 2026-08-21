import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * SECURITY REGRESSION (authentication bypass) — login verifies NO credential.
 *
 * POST /auth/login (and its siblings POST /admin/auth/login and the mobile
 * /user/login) authenticate by PHONE NUMBER ALONE — no OTP, no password, no
 * secret; the request bodies do not even carry one. Anyone who knows or guesses
 * a number takes over the account, and an admin number is a full admin takeover.
 * Verified live by the Pentest agent: a login with a WRONG otp returned 201 with
 * role:"admin" and that cookie read /profile/admin/access-logs (200).
 *
 * The real fix is one-time-code verification, which is not built yet. The
 * INTERIM (this) closes the bypass where it matters — production — mirroring the
 * wallet-faucet gate: credential-less login is refused outright in production
 * and cannot be re-enabled by a flag, and left working in dev/test/staging so
 * local work and e2e are unaffected. These tests assert that interim guarantee.
 *
 * When one-time-code verification lands, replace these with assertions that a
 * wrong/missing code is rejected in EVERY environment, and delete the gate.
 */
describe('AuthController.login — credential-less login is refused in production', () => {
  let controller: AuthController;
  let jwt: { sign: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let businessRepo: { findOne: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };
  const ORIGINAL_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    jwt = { sign: jest.fn().mockReturnValue('jwt.tok.en') };
    // A real, known admin account — the only thing the attacker supplies is the
    // phone number.
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 2, role: 'admin', phoneNumber: '+27801234567', name: 'Test Admin' }) };
    businessRepo = { findOne: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AuthController(jwt as any, userRepo as any, businessRepo as any);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('refuses to mint a session in production, and sets no cookie', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.login({ phoneNumber: '+27801234567' } as any, res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('refuses before touching the database in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.login({ phoneNumber: '+27801234567' } as any, res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The gate fires first, so no lookup happens — an attacker learns nothing.
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('still works outside production, so dev and e2e are unaffected', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      controller.login({ phoneNumber: '+27801234567' } as any, res as any),
    ).resolves.toMatchObject({ user: { role: 'admin' } });
    expect(res.cookie).toHaveBeenCalled();
  });
});
