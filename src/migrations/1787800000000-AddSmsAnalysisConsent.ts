import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Consent for our internal analyser to read a user's SMS content.
 *
 * Default FALSE, deliberately. The server otherwise only ever receives an
 * on-device MD5 hash of an SMS, never the text — this column is the single
 * switch that authorises the text to reach the server, for one user, so it can
 * be turned into profile-update and survey suggestions. Off keeps the existing
 * hash-only guarantee for everyone; nobody is opted in by this migration.
 */
export class AddSmsAnalysisConsent1787800000000 implements MigrationInterface {
    name = 'AddSmsAnalysisConsent1787800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "smsAnalysisConsent" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN IF EXISTS "smsAnalysisConsent"`,
        );
    }
}
