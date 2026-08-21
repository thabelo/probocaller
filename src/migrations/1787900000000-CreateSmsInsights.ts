import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Structured suggestions the analyser drew from a consented user's SMS content.
 *
 * Stores the suggestion and a short evidence label only — never the SMS text.
 * A profile_field row waits for the user to confirm it; a survey_question row
 * waits for an admin to approve it. Nothing here changes a profile or publishes
 * a survey on its own.
 */
export class CreateSmsInsights1787900000000 implements MigrationInterface {
    name = 'CreateSmsInsights1787900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "sms_insights" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "kind" character varying(24) NOT NULL,
            "fieldKey" character varying(64),
            "suggestedValue" text,
            "prompt" text,
            "questionType" character varying(32),
            "confidence" numeric(4,3) NOT NULL DEFAULT 0,
            "evidence" text NOT NULL DEFAULT '',
            "status" character varying(16) NOT NULL DEFAULT 'pending',
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_sms_insights" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_sms_insights_user_status" ON "sms_insights" ("userId", "status")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "sms_insights"`);
    }
}
