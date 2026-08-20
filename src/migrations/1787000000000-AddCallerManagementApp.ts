import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the sign-up picker's three apps real.
 *
 * A new user now chooses their apps on one screen straight after registering,
 * with Databroker (the base app), Surveys and the Caller Management App all
 * toggled on. Databroker was already live; the other two were not installable:
 *
 *   caller-management — had no catalogue row at all. Screening, the dialer, the
 *                       messages and contacts tabs shipped as the app's default
 *                       shell rather than as something you opt into, so there
 *                       was nothing to install. It becomes an app because
 *                       declining it has to mean the phone, SMS and contacts
 *                       permissions are never requested.
 *   surveys           — announced early as 'coming_soon'. Its screens ship, so
 *                       releasing it is the status change the original seed
 *                       anticipated.
 *
 * The paired business half, 'survey-campaigns', is deliberately left alone:
 * the picker is a personal-account screen, and that app has its own audience.
 *
 * ON CONFLICT DO NOTHING keeps this re-runnable and stops it clobbering copy an
 * admin has since edited in the panel.
 */
export class AddCallerManagementApp1787000000000 implements MigrationInterface {
  name = 'AddCallerManagementApp1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "apps"
        ("key", "name", "tagline", "icon", "category", "audience", "status", "requiresKyb", "pairedAppKey")
      VALUES
        ('caller-management', 'Caller Management',
         'Screen unknown callers, block spam calls and filter scam texts.',
         'PhoneIcon', 'protect', 'user', 'live', false, NULL)
      ON CONFLICT ("key") DO NOTHING
    `);

    // Only from the announcement state: an admin who has since retired Surveys
    // meant it, and this migration must not quietly put it back on sale.
    await queryRunner.query(
      `UPDATE "apps" SET "status" = 'live' WHERE "key" = 'surveys' AND "status" = 'coming_soon'`,
    );

    // Everyone who registered before the picker existed already HAS caller
    // management, so they all get an install row. Without it, this deploy would
    // take screening, the dialer and the messages and contacts tabs away from
    // every existing account — the app would look like it had been gutted.
    // Only Surveys is genuinely new to them, and that stays opt-in.
    //
    // `WHERE NOT EXISTS` rather than ON CONFLICT: the uniqueness index is
    // partial (active installs only), so it would not catch a duplicate here.
    await queryRunner.query(`
      INSERT INTO "app_installs" ("userId", "appKey", "installedAt")
      SELECT u."id", 'caller-management', now()
      FROM "users" u
      WHERE NOT EXISTS (
        SELECT 1 FROM "app_installs" i
        WHERE i."userId" = u."id" AND i."appKey" = 'caller-management'
      )
    `);
  }

  /**
   * Surveys goes back to the state this migration found it in. Caller
   * Management is deleted outright — it did not exist before, and its install
   * rows go with it via the same cascade any other catalogue removal uses.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "apps" SET "status" = 'coming_soon' WHERE "key" = 'surveys'`,
    );
    await queryRunner.query(`DELETE FROM "app_installs" WHERE "appKey" = 'caller-management'`);
    await queryRunner.query(`DELETE FROM "apps" WHERE "key" = 'caller-management'`);
  }
}
