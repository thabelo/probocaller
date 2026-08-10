import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SMS permissions: an INDEPENDENT, parallel sibling of the call-permission
 * columns (see AddFourCategoryCallPolicy / AddCallBasePreset /
 * MultipleCustomCallRules) — same shape (preset / base / four categories /
 * custom rules), but for who may SMS you, entirely separate storage from the
 * call columns. See src/data-broker/sms-policy.ts.
 */
export class AddSmsPermissionColumns1786000000000 implements MigrationInterface {
  name = 'AddSmsPermissionColumns1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "smsPermissionMode" character varying NOT NULL DEFAULT 'all_paid_biz'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "smsBasePreset" character varying NOT NULL DEFAULT 'all_paid_biz'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contactsSmsPolicy" character varying NOT NULL DEFAULT 'free'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "businessSmsPolicy" character varying NOT NULL DEFAULT 'paid'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "newSmsPolicy" character varying NOT NULL DEFAULT 'free'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unknownSmsPolicy" character varying NOT NULL DEFAULT 'free'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customSmsRules" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "selectedCustomSmsRuleId" character varying NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "selectedCustomSmsRuleId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "customSmsRules"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "unknownSmsPolicy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "newSmsPolicy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "businessSmsPolicy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "contactsSmsPolicy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "smsBasePreset"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "smsPermissionMode"`);
  }
}
