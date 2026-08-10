import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Global, admin-managed business number whitelist (src/business-whitelist/).
 * This table has no userId; admins manage one shared list of
 * trusted/verified business numbers that mobile devices sync down and use
 * natively to bypass call-screening/spam-blocking.
 */
export class CreateWhitelistedNumbers1785900000000 implements MigrationInterface {
  name = 'CreateWhitelistedNumbers1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "whitelisted_numbers" ("id" SERIAL NOT NULL, "phoneNumber" character varying NOT NULL, "label" character varying, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_whitelisted_numbers" PRIMARY KEY ("id"))`,
    );
    // The sync endpoint filters on exactly this column for every device sync call.
    await queryRunner.query(`CREATE INDEX "IDX_whitelisted_numbers_active" ON "whitelisted_numbers" ("active")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_whitelisted_numbers_active"`);
    await queryRunner.query(`DROP TABLE "whitelisted_numbers"`);
  }
}
