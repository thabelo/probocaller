import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom rules become MULTIPLE standalone named policies that sit beside the six
 * preset tiers in one radio group (selectable/deletable like normal rules):
 *  - customCallRules  jsonb [{ id, name, contacts, business, newCaller, unknown }]
 *  - selectedCustomRuleId ('' = the callBasePreset tier is active)
 * Existing single-name groups (callRuleName) are converted into one saved,
 * selected rule built from the user's current four category dials.
 */
export class MultipleCustomCallRules1784900000000 implements MigrationInterface {
  name = 'MultipleCustomCallRules1784900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "customCallRules" jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`ALTER TABLE "users" ADD "selectedCustomRuleId" character varying NOT NULL DEFAULT ''`);
    // Convert each named single-group override into one selected custom rule.
    await q.query(`
      UPDATE "users" SET
        "customCallRules" = jsonb_build_array(jsonb_build_object(
          'id', 'r-' || md5("id"::text || "callRuleName"),
          'name', "callRuleName",
          'contacts', COALESCE("contactsCallPolicy", 'free'),
          'business', COALESCE("businessCallPolicy", 'paid'),
          'newCaller', COALESCE("newCallPolicy", 'free'),
          'unknown', COALESCE("unknownCallPolicy", 'free')
        )),
        "selectedCustomRuleId" = 'r-' || md5("id"::text || "callRuleName")
      WHERE "callRuleName" <> ''
    `);
    await q.query(`ALTER TABLE "users" DROP COLUMN "callRuleName"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "callRuleName" character varying NOT NULL DEFAULT ''`);
    // Restore the single-group name from the selected rule, if any.
    await q.query(`
      UPDATE "users" u SET "callRuleName" = COALESCE(
        (SELECT r->>'name' FROM jsonb_array_elements(u."customCallRules") r
          WHERE r->>'id' = u."selectedCustomRuleId" LIMIT 1), '')
      WHERE u."selectedCustomRuleId" <> ''
    `);
    await q.query(`ALTER TABLE "users" DROP COLUMN "selectedCustomRuleId"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "customCallRules"`);
  }
}
