import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personal FICA requirements are now per-country (see
 * src/fica/fica-country-config.ts): South Africa keeps today's tailored
 * front/back-ID + proof-of-address + selfie set, every other country gets a
 * generic combined-ID fallback. Existing rows predate the split and were all
 * built against the SA document set, so they default to 'ZA' — zero
 * behaviour change for them.
 */
export class AddFicaSubmissionCountryCode1785700000000 implements MigrationInterface {
  name = 'AddFicaSubmissionCountryCode1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fica_submissions" ADD COLUMN IF NOT EXISTS "countryCode" character varying NOT NULL DEFAULT 'ZA'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fica_submissions" DROP COLUMN IF EXISTS "countryCode"`);
  }
}
