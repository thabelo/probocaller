import { MigrationInterface, QueryRunner } from "typeorm";

export class TierAndIncognito1780500000000 implements MigrationInterface {
    name = 'TierAndIncognito1780500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "tier" character varying NOT NULL DEFAULT 'free'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "incognitoEnabled" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "incognitoEnabled"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tier"`);
    }

}
