import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds callBasePreset — the tier the user selected. Custom per-category rules are
 * overrides layered on top; deleting a rule reverts that category to the base's
 * value. Backfills from the existing callPermissionMode when it is a real preset
 * (not 'custom'), else defaults to all_paid_biz.
 */
export class AddCallBasePreset1784600000000 implements MigrationInterface {
  name = 'AddCallBasePreset1784600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "callBasePreset" character varying NOT NULL DEFAULT 'all_paid_biz'`);
    await q.query(`UPDATE "users" SET "callBasePreset" = "callPermissionMode" WHERE "callPermissionMode" <> 'custom'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "callBasePreset"`);
  }
}
