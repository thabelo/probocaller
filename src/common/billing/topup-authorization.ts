import { ForbiddenException } from '@nestjs/common';
import { Environment } from '../config/app-config';

/**
 * Gate for the wallet top-up endpoints (POST /user/credit,
 * POST /business/:id/wallet/topup), which credit a wallet from nothing.
 *
 * Until a payment provider verifies that money actually arrived, self-service
 * crediting is a free-money faucet. The rule:
 *
 *   - Admins may always credit a wallet (manual, audited adjustment).
 *   - Anyone else needs ALLOW_UNVERIFIED_TOPUP=true, and that opt-in is
 *     IGNORED in production. A flag that can be flipped in prod is the same
 *     faucet with an extra step, so prod has no opt-in at all.
 *
 * When the payment provider lands, the self-service path becomes "credit only
 * after a verified webhook/receipt" and this gate covers the manual path only.
 */
export interface TopUpContext {
  isAdmin: boolean;
  environment: Environment;
  allowUnverifiedTopUp: boolean;
}

export function isTopUpAllowed({ isAdmin, environment, allowUnverifiedTopUp }: TopUpContext): boolean {
  if (isAdmin) return true;
  if (environment === 'production') return false;
  return allowUnverifiedTopUp;
}

export function assertTopUpAllowed(context: TopUpContext): void {
  if (isTopUpAllowed(context)) return;
  throw new ForbiddenException(
    'Wallet top-ups require a verified payment. Self-service crediting is disabled until a payment provider is connected.',
  );
}

// Reads the opt-in from the environment. Anything other than the exact string
// 'true' is off — a typo must fail closed, not open the faucet.
export function readAllowUnverifiedTopUp(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ALLOW_UNVERIFIED_TOPUP ?? '').trim().toLowerCase() === 'true';
}
