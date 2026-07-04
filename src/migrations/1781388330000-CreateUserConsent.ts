import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserConsent1781388330000 implements MigrationInterface {
    name = 'CreateUserConsent1781388330000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_consents" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "consentType" character varying NOT NULL, "version" character varying NOT NULL, "grantedAt" TIMESTAMP NOT NULL, "revokedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_user_consents" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_user_consents_user_type" ON "user_consents" ("userId", "consentType") `);
        await queryRunner.query(`ALTER TABLE "user_consents" ADD CONSTRAINT "FK_user_consents_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_consents" DROP CONSTRAINT "FK_user_consents_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_consents_user_type"`);
        await queryRunner.query(`DROP TABLE "user_consents"`);
    }
}
