import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A record of every "how many people match this?" question a business asks.
 *
 * The audience estimate is the only number a business can ask for repeatedly,
 * for free, without publishing anything and without anybody answering — the
 * cheapest way to probe who exists. The answer is now banded so a one-person
 * difference is invisible; this table is what makes a CAMPAIGN of probes
 * visible after the fact.
 *
 * Detective, not preventive, and deliberately so: blocking probes would break
 * the shortfall warning the builder depends on. It stores the BAND rather than
 * the count, because a log holding the exact numbers would rebuild the oracle
 * the banding exists to close.
 */
export class CreateSurveyAudienceProbes1787500000000 implements MigrationInterface {
    name = 'CreateSurveyAudienceProbes1787500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "survey_audience_probes" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "businessId" integer,
            "filtersJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
            "band" character varying(16) NOT NULL,
            "probedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_survey_audience_probes" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_survey_audience_probes_userId" ON "survey_audience_probes" ("userId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "survey_audience_probes"`);
    }
}
