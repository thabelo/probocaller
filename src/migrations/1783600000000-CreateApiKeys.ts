import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateApiKeys1783600000000 implements MigrationInterface {
    name = 'CreateApiKeys1783600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "api_keys" ("id" SERIAL NOT NULL, "businessId" integer NOT NULL, "key" character varying NOT NULL, "label" character varying, "scopes" text NOT NULL DEFAULT '', "revoked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_api_keys" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_api_keys_key" ON "api_keys" ("key")`);
        await queryRunner.query(`ALTER TABLE "api_keys" ADD CONSTRAINT "FK_api_keys_business" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" DROP CONSTRAINT "FK_api_keys_business"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_api_keys_key"`);
        await queryRunner.query(`DROP TABLE "api_keys"`);
    }
}
