import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateErrorLog1783188411820 implements MigrationInterface {
    name = 'CreateErrorLog1783188411820'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "error_logs" ("id" SERIAL NOT NULL, "source" character varying NOT NULL, "level" character varying NOT NULL DEFAULT 'error', "message" text NOT NULL, "stack" text, "context" json, "appVersion" character varying, "platform" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_error_logs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_error_logs_source_createdAt" ON "error_logs" ("source", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_error_logs_level_createdAt" ON "error_logs" ("level", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_error_logs_level_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_error_logs_source_createdAt"`);
        await queryRunner.query(`DROP TABLE "error_logs"`);
    }
}
