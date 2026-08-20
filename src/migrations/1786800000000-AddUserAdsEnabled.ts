import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ads opt-in flag. Defaults to false so every existing user stays opted OUT —
 * ads must be an active choice, and only opted-in users earn the
 * AD_REVENUE_SHARE_RATE share of the revenue their impressions produce.
 */
export class AddUserAdsEnabled1786800000000 implements MigrationInterface {
    name = 'AddUserAdsEnabled1786800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "adsEnabled" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "adsEnabled"`);
    }
}
