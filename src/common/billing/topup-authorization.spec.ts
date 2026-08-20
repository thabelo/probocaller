import { ForbiddenException } from '@nestjs/common';
import { assertTopUpAllowed, isTopUpAllowed } from './topup-authorization';

/**
 * The wallet faucet (LAUNCH BLOCKER): POST /user/credit and
 * POST /business/:id/wallet/topup credit wallets from nothing. Until a payment
 * provider verifies the money actually arrived, self-service crediting must be
 * impossible in production — and no env var may re-open it there, because a
 * flag that can be flipped in prod is the same faucet with an extra step.
 */
describe('topup-authorization', () => {
  describe('production', () => {
    it('refuses a self-service top-up', () => {
      expect(isTopUpAllowed({ isAdmin: false, environment: 'production', allowUnverifiedTopUp: false })).toBe(false);
    });

    // The whole point of the gate: no env var may re-open the faucet in prod.
    it('refuses a self-service top-up even when the opt-in env var is set', () => {
      expect(isTopUpAllowed({ isAdmin: false, environment: 'production', allowUnverifiedTopUp: true })).toBe(false);
    });

    it('still allows an admin to credit a wallet manually', () => {
      expect(isTopUpAllowed({ isAdmin: true, environment: 'production', allowUnverifiedTopUp: false })).toBe(true);
    });
  });

  describe('non-production', () => {
    it('refuses a self-service top-up by default — the opt-in must be explicit', () => {
      for (const environment of ['development', 'staging', 'test'] as const) {
        expect(isTopUpAllowed({ isAdmin: false, environment, allowUnverifiedTopUp: false })).toBe(false);
      }
    });

    it('allows a self-service top-up when explicitly opted in (dev/e2e funding)', () => {
      for (const environment of ['development', 'staging', 'test'] as const) {
        expect(isTopUpAllowed({ isAdmin: false, environment, allowUnverifiedTopUp: true })).toBe(true);
      }
    });
  });

  describe('assertTopUpAllowed', () => {
    it('throws Forbidden with a reason the caller can act on', () => {
      expect(() =>
        assertTopUpAllowed({ isAdmin: false, environment: 'production', allowUnverifiedTopUp: true }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertTopUpAllowed({ isAdmin: false, environment: 'production', allowUnverifiedTopUp: true }),
      ).toThrow(/payment/i);
    });

    it('is a no-op when the top-up is allowed', () => {
      expect(() =>
        assertTopUpAllowed({ isAdmin: true, environment: 'production', allowUnverifiedTopUp: false }),
      ).not.toThrow();
    });
  });
});
