import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessApiKey1783500000000 implements MigrationInterface {
    name = 'AddBusinessApiKey1783500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" ADD "apiKey" character varying`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_businesses_apiKey" ON "businesses" ("apiKey")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_businesses_apiKey"`);
        await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "apiKey"`);
    }
}
