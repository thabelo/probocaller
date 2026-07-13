import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two-dial call policy: personalCallPolicy + businessCallPolicy become the source of
 * truth for call gating (see call/call-policy.ts). Backfills the dials from the
 * legacy callPermissionMode and normalises the mode to the new six-tier preset names.
 */
export class AddCallPolicyDials1784400000000 implements MigrationInterface {
  name = 'AddCallPolicyDials1784400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "personalCallPolicy" character varying NOT NULL DEFAULT 'everyone'`);
    await q.query(`ALTER TABLE "users" ADD "businessCallPolicy" character varying NOT NULL DEFAULT 'paid'`);

    // Backfill the dials from the legacy mode.
    await q.query(`UPDATE "users" SET "personalCallPolicy"='everyone', "businessCallPolicy"='paid' WHERE "callPermissionMode" IN ('all','everyone')`);
    await q.query(`UPDATE "users" SET "personalCallPolicy"='contacts', "businessCallPolicy"='paid' WHERE "callPermissionMode"='approved_only'`);
    await q.query(`UPDATE "users" SET "personalCallPolicy"='everyone', "businessCallPolicy"='blocked' WHERE "callPermissionMode"='none'`);

    // Normalise the mode to the new preset names.
    await q.query(`UPDATE "users" SET "callPermissionMode"='all_paid_biz' WHERE "callPermissionMode" IN ('all','everyone')`);
    await q.query(`UPDATE "users" SET "callPermissionMode"='contacts_paid_biz' WHERE "callPermissionMode"='approved_only'`);
    await q.query(`UPDATE "users" SET "callPermissionMode"='custom' WHERE "callPermissionMode"='none'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "businessCallPolicy"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "personalCallPolicy"`);
  }
}
