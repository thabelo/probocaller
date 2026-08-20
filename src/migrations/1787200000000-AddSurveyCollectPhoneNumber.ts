import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Opt-in for a survey to collect respondents' phone numbers.
 *
 * Defaults FALSE so no existing survey silently starts paying the per-response
 * phone fee. A business turns it on in the builder, where the quote shows what
 * it adds before anything is published.
 */
export class AddSurveyCollectPhoneNumber1787200000000 implements MigrationInterface {
    name = 'AddSurveyCollectPhoneNumber1787200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" ADD "collectPhoneNumber" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN "collectPhoneNumber"`);
    }
}
