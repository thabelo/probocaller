import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Billing ledger for reverse-lookups (Google Places): one row per lookup, with
 * cost, line type, and whether it was a free cached hit — powers the admin
 * reverse-lookup billing/stats dashboard.
 */
export class CreateReverseLookupEvents1784300000000 implements MigrationInterface {
    name = 'CreateReverseLookupEvents1784300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "reverse_lookup_events" (
                "id" SERIAL NOT NULL,
                "phoneNumber" character varying NOT NULL,
                "provider" character varying NOT NULL DEFAULT 'google',
                "cached" boolean NOT NULL DEFAULT false,
                "lineType" character varying,
                "hasName" boolean NOT NULL DEFAULT false,
                "success" boolean NOT NULL DEFAULT true,
                "costUsd" numeric(10,4) NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_reverse_lookup_events_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_reverse_lookup_events_createdAt" ON "reverse_lookup_events" ("createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_reverse_lookup_events_createdAt"`);
        await queryRunner.query(`DROP TABLE "reverse_lookup_events"`);
    }
}
