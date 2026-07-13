import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expands the call policy from two dials to four caller categories
 * (contacts, business, newCaller, unknown) — each free | paid | blocked
 * (see call/call-policy.ts). businessCallPolicy is kept as-is; the three new
 * columns are backfilled from the legacy personalCallPolicy. callPermissionMode
 * is derived from the four columns on read, so it is left untouched here.
 */
export class AddFourCategoryCallPolicy1784500000000 implements MigrationInterface {
  name = 'AddFourCategoryCallPolicy1784500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "contactsCallPolicy" character varying NOT NULL DEFAULT 'free'`);
    await q.query(`ALTER TABLE "users" ADD "newCallPolicy" character varying NOT NULL DEFAULT 'free'`);
    await q.query(`ALTER TABLE "users" ADD "unknownCallPolicy" character varying NOT NULL DEFAULT 'free'`);

    // Backfill the personal categories from the legacy personalCallPolicy dial.
    const setBoth = (val: string) =>
      `"newCallPolicy"='${val}', "unknownCallPolicy"='${val}'`;
    await q.query(`UPDATE "users" SET "contactsCallPolicy"='free', ${setBoth('free')}    WHERE "personalCallPolicy"='everyone'`);
    await q.query(`UPDATE "users" SET "contactsCallPolicy"='free', ${setBoth('blocked')} WHERE "personalCallPolicy"='contacts'`);
    await q.query(`UPDATE "users" SET "contactsCallPolicy"='free', ${setBoth('paid')}    WHERE "personalCallPolicy"='contacts_paid'`);
    await q.query(`UPDATE "users" SET "contactsCallPolicy"='free', ${setBoth('paid')}    WHERE "personalCallPolicy"='paid'`);
    await q.query(`UPDATE "users" SET "contactsCallPolicy"='blocked', ${setBoth('blocked')} WHERE "personalCallPolicy"='blocked'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "unknownCallPolicy"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "newCallPolicy"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "contactsCallPolicy"`);
  }
}
