import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1778677903728 implements MigrationInterface {
    name = 'InitialSchema1778677903728'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_logs" ALTER COLUMN "ratePerSecond" SET DEFAULT '0.002'`);
        await queryRunner.query(`ALTER TABLE "profile_fields" ALTER COLUMN "creditCost" SET DEFAULT '0.01'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_fields" ALTER COLUMN "creditCost" SET DEFAULT 0.01`);
        await queryRunner.query(`ALTER TABLE "call_logs" ALTER COLUMN "ratePerSecond" SET DEFAULT 0.002`);
    }

}
