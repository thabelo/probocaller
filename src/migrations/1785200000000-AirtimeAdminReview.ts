import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Airtime redemptions are now processed by a ProboCaller admin rather than
 * auto-fulfilled by an external provider, so each request records WHO resolved it
 * and WHEN — the same audit trail bank withdrawals already carry.
 *
 * Existing rows keep NULL: they predate admin review, and a NULL reviewer is the
 * honest answer for a request that no admin ever touched.
 */
export class AirtimeAdminReview1785200000000 implements MigrationInterface {
  name = 'AirtimeAdminReview1785200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "airtime_payouts" ADD COLUMN IF NOT EXISTS "reviewedBy" integer`,
    );
    await q.query(
      `ALTER TABLE "airtime_payouts" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "airtime_payouts" DROP COLUMN IF EXISTS "reviewedAt"`);
    await q.query(`ALTER TABLE "airtime_payouts" DROP COLUMN IF EXISTS "reviewedBy"`);
  }
}
