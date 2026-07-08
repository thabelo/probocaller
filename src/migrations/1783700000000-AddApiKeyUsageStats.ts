import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApiKeyUsageStats1783700000000 implements MigrationInterface {
    name = 'AddApiKeyUsageStats1783700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "callCount" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "totalSpend" numeric(12,4) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "lastUsedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "lastUsedAt"`);
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "totalSpend"`);
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "callCount"`);
    }
}
