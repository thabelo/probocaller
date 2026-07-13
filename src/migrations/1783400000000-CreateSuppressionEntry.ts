import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSuppressionEntry1783400000000 implements MigrationInterface {
    name = 'CreateSuppressionEntry1783400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "suppression_entries" ("id" SERIAL NOT NULL, "numberHash" character varying NOT NULL, "reason" text, "source" character varying NOT NULL DEFAULT 'public', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_suppression_entries" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_suppression_entries_numberHash" ON "suppression_entries" ("numberHash") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_suppression_entries_numberHash"`);
        await queryRunner.query(`DROP TABLE "suppression_entries"`);
    }
}
