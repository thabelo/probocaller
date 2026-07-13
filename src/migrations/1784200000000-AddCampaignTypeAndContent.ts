import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Campaigns become ads or surveys. Each carries its type, its delivery channel
 * (in-app or calls/SMS), and its content: an ad's creative + CTA link, or a
 * survey's question list. Existing rows become in-app ads by default.
 */
export class AddCampaignTypeAndContent1784200000000 implements MigrationInterface {
    name = 'AddCampaignTypeAndContent1784200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "type" character varying(16) NOT NULL DEFAULT 'ad'`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "channel" character varying(16) NOT NULL DEFAULT 'in_app'`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "creative" text`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "ctaUrl" character varying(512)`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "questions" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "questions"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "ctaUrl"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "creative"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "channel"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "type"`);
    }
}
