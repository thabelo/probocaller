import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the nullable `matchedKeyword` column to sms_logs. It records the scam
 * keyword/pattern that matched a blocked message (null for policy-only blocks
 * or allowed messages), so the admin SMS-logs list can filter by keyword.
 */
export class AddSmsLogMatchedKeyword1786200000000 implements MigrationInterface {
  name = 'AddSmsLogMatchedKeyword1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sms_logs" ADD COLUMN "matchedKeyword" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sms_logs" DROP COLUMN "matchedKeyword"`);
  }
}
