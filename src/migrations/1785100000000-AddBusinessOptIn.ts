import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business mode becomes OPT-IN: a normal account has no business surface until
 * the user explicitly enables it (free, after the intro/onboarding).
 *
 * `businessOptIn` is deliberately distinct from `isBusiness`:
 *   - businessOptIn — the user has chosen to see business functionality
 *   - isBusiness    — the user has actually registered a company
 *
 * Anyone who already registered a company is by definition past the intro, so
 * they are backfilled as opted-in — without this, existing business owners
 * would be locked out of their own business surfaces on deploy.
 */
export class AddBusinessOptIn1785100000000 implements MigrationInterface {
  name = 'AddBusinessOptIn1785100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "businessOptIn" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `UPDATE "users" SET "businessOptIn" = true WHERE "isBusiness" = true`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "businessOptIn"`);
  }
}
