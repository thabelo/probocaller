import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminInvite1781388310000 implements MigrationInterface {
    name = 'CreateAdminInvite1781388310000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admin_invites" ("id" SERIAL NOT NULL, "phoneNumber" character varying NOT NULL, "token" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'admin', "invitedByUserId" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "expiresAt" TIMESTAMP NOT NULL, "redeemedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_admin_invites_token" UNIQUE ("token"), CONSTRAINT "PK_admin_invites" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_invites_status" ON "admin_invites" ("status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_invites_status"`);
        await queryRunner.query(`DROP TABLE "admin_invites"`);
    }
}
