import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retrofits existing users onto the marketplace.
 *
 * The acceptance criterion for this migration is that NOTHING user-visible
 * changes: everyone who can use Databroker or Audience & Leads today must still
 * be able to the moment it lands. Without the back-fill, entitlement checks
 * would find no install rows and silently take working features away from every
 * existing account.
 *
 * The two audiences map to two different existing signals:
 *   data-broker    — users already sharing data (`dataShareEnabled`), since for
 *                    Databroker that flag IS the consent the install represents.
 *   audience-leads — users with business access, read with the same tri-state
 *                    rule the app uses: an explicit opt-out loses, and only an
 *                    unanswered flag falls back to `isBusiness`.
 *
 * `WHERE NOT EXISTS` rather than ON CONFLICT: the uniqueness index is partial
 * (active installs only), so it would not catch a duplicate here.
 */
export class BackfillMarketplaceInstalls1786600000000
  implements MigrationInterface
{
  name = 'BackfillMarketplaceInstalls1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "app_installs" ("userId", "appKey", "installedAt")
      SELECT u."id", 'data-broker', now()
      FROM "users" u
      WHERE u."dataShareEnabled" = true
        AND NOT EXISTS (
          SELECT 1 FROM "app_installs" i
          WHERE i."userId" = u."id" AND i."appKey" = 'data-broker'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "app_installs" ("userId", "appKey", "installedAt")
      SELECT u."id", 'audience-leads', now()
      FROM "users" u
      WHERE (
          u."businessOptIn" = true
          OR (u."businessOptIn" IS NULL AND u."isBusiness" = true)
        )
        AND NOT EXISTS (
          SELECT 1 FROM "app_installs" i
          WHERE i."userId" = u."id" AND i."appKey" = 'audience-leads'
        )
    `);
  }

  /**
   * Only the rows this migration could have created. Installs made by users
   * after it ran are indistinguishable from back-filled ones, so `down` is
   * necessarily approximate — it is a rollback aid, not an exact inverse.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "app_installs" WHERE "appKey" IN ('data-broker', 'audience-leads')`,
    );
  }
}
