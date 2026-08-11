import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Global, admin-managed scam keyword list (src/scam-keyword/). Distinct from
 * blocked_keywords (per-user, already migrated) — this table has no userId;
 * admins manage one shared list that mobile devices sync down and merge
 * locally with their own cold-start seed. The mobile app's baseline
 * DEFAULT_SCAM_KEYWORDS (17 words) are also seeded into this table by
 * 1786300000000-SeedDefaultScamKeywords, so they're now admin-editable too.
 */
export class CreateScamKeywords1785800000000 implements MigrationInterface {
  name = 'CreateScamKeywords1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "scam_keywords" ("id" SERIAL NOT NULL, "keyword" character varying NOT NULL, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_scam_keywords" PRIMARY KEY ("id"))`,
    );
    // The sync endpoint filters on exactly this column for every device sync call.
    await queryRunner.query(`CREATE INDEX "IDX_scam_keywords_active" ON "scam_keywords" ("active")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_scam_keywords_active"`);
    await queryRunner.query(`DROP TABLE "scam_keywords"`);
  }
}
