import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Campaigns: an outbound calling effort a business runs — who it targets, which
 * of its numbers it dials from, its budget/spend, and its lifecycle status.
 * Deleting a business removes its campaigns.
 */
export class CreateCampaigns1783900000000 implements MigrationInterface {
    name = 'CreateCampaigns1783900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "campaigns" (
                "id" SERIAL NOT NULL,
                "businessId" integer NOT NULL,
                "name" character varying NOT NULL,
                "filters" text NOT NULL DEFAULT '{}',
                "audienceId" integer,
                "callingNumberId" integer,
                "budget" numeric(12,4) NOT NULL DEFAULT 0,
                "spent" numeric(12,4) NOT NULL DEFAULT 0,
                "leadsPurchased" integer NOT NULL DEFAULT 0,
                "status" character varying(16) NOT NULL DEFAULT 'draft',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_campaigns_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_campaigns_businessId" ON "campaigns" ("businessId")`);
        await queryRunner.query(`
            ALTER TABLE "campaigns"
            ADD CONSTRAINT "FK_campaigns_business"
            FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT "FK_campaigns_business"`);
        await queryRunner.query(`DROP INDEX "IDX_campaigns_businessId"`);
        await queryRunner.query(`DROP TABLE "campaigns"`);
    }
}
