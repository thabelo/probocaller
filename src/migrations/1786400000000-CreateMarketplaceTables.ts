import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * App marketplace (src/marketplace/).
 *
 * `apps` is the admin-managed catalogue — launching an app is a status change,
 * not a release. `app_installs` records which apps a user has turned on.
 *
 * Uninstalling sets `uninstalledAt` rather than deleting the row (consent
 * history stays auditable, and a reinstall restores `settingsJson`), so the
 * uniqueness rule has to be PARTIAL: at most one ACTIVE install per user per
 * app, with any number of dormant rows behind it.
 */
export class CreateMarketplaceTables1786400000000 implements MigrationInterface {
  name = 'CreateMarketplaceTables1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "apps" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "name" character varying NOT NULL, "tagline" character varying NOT NULL DEFAULT '', "icon" character varying NOT NULL DEFAULT '', "category" character varying NOT NULL DEFAULT '', "audience" character varying NOT NULL DEFAULT 'user', "status" character varying NOT NULL DEFAULT 'coming_soon', "requiresKyb" boolean NOT NULL DEFAULT false, "pricingModel" character varying NOT NULL DEFAULT 'free', "priceCents" integer, "minAppVersion" character varying, "pairedAppKey" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_apps" PRIMARY KEY ("id"), CONSTRAINT "UQ_apps_key" UNIQUE ("key"))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "app_installs" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "appKey" character varying NOT NULL, "installedAt" TIMESTAMP NOT NULL, "uninstalledAt" TIMESTAMP, "settingsJson" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_installs" PRIMARY KEY ("id"))`,
    );

    // Every access check filters on this pair.
    await queryRunner.query(
      `CREATE INDEX "IDX_app_installs_userId_appKey" ON "app_installs" ("userId", "appKey")`,
    );

    // One live install per user per app; dormant rows are exempt.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_app_installs_active" ON "app_installs" ("userId", "appKey") WHERE "uninstalledAt" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "app_installs" ADD CONSTRAINT "FK_app_installs_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_installs" DROP CONSTRAINT "FK_app_installs_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_app_installs_active"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_app_installs_userId_appKey"`,
    );
    await queryRunner.query(`DROP TABLE "app_installs"`);
    await queryRunner.query(`DROP TABLE "apps"`);
  }
}
