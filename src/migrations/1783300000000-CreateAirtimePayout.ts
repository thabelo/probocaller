import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAirtimePayout1783300000000 implements MigrationInterface {
    name = 'CreateAirtimePayout1783300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "airtime_payouts" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "amount" numeric(10,4) NOT NULL, "phoneNumber" character varying NOT NULL, "network" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "providerRef" text, "failureReason" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_airtime_payouts" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_airtime_payouts_userId" ON "airtime_payouts" ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_airtime_payouts_userId"`);
        await queryRunner.query(`DROP TABLE "airtime_payouts"`);
    }
}
