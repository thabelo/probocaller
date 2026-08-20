import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Two columns the survey results feature needs on a survey row.
 *
 * `audienceAtPublish` — publishing now refuses an audience too small to ever
 * report back without identifying someone. Recording the number it was sold
 * against makes that refusal answerable later, and explains a survey that
 * settled short.
 *
 * `resultsCohortLogged` — results are released to a business in whole batches,
 * and every newly-opened batch owes each respondent in it a line in their own
 * access log. This is the high-water mark of what has already been logged, so
 * refreshing the results page cannot write the same disclosure again. Defaults
 * to 0, which is correct for every existing survey: nothing has been released
 * to anybody yet, because until now there was no way to read results at all.
 */
export class AddSurveyResultsColumns1787400000000 implements MigrationInterface {
    name = 'AddSurveyResultsColumns1787400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "audienceAtPublish" integer`);
        await queryRunner.query(`ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "resultsCohortLogged" integer NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN IF EXISTS "resultsCohortLogged"`);
        await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN IF EXISTS "audienceAtPublish"`);
    }
}
