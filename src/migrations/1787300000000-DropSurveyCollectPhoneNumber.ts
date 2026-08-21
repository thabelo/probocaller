import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Surveys go back to being anonymous.
 *
 * Collecting a respondent's phone number contradicted what both clients promise
 * them — "never your name, your number, or that it was you" — and duplicated,
 * without any of its protections, the consented channel that already exists:
 * the Brokerage Profile's phoneShareEnabled, which carries a consent receipt, a
 * data certificate, an access-log entry and an erasure path.
 *
 * IF EXISTS because the adding migration may never have run: dev builds the
 * schema with synchronize, so this has to be safe either way.
 */
export class DropSurveyCollectPhoneNumber1787300000000 implements MigrationInterface {
    name = 'DropSurveyCollectPhoneNumber1787300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" DROP COLUMN IF EXISTS "collectPhoneNumber"`);
    }

    /**
     * Reversible for schema integrity only. Rolling this back does NOT restore
     * phone collection: the DTO no longer accepts the field, the pricing no
     * longer charges for it and the response path no longer writes it, so the
     * column comes back empty and stays that way. It is here so a rollback
     * chain does not break, not because the feature can be recovered by one.
     */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "collectPhoneNumber" boolean NOT NULL DEFAULT false`);
    }
}
