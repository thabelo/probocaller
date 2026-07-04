import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLog1781388320000 implements MigrationInterface {
    name = 'CreateAuditLog1781388320000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "actorUserId" integer, "action" character varying NOT NULL, "targetType" character varying, "targetId" character varying, "metadata" text, "ip" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_action"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_createdAt"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }
}
