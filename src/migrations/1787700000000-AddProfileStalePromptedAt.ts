import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * When we last asked somebody whether anything on their profile had changed.
 *
 * The cooldown reads from here. It is what keeps the nudge a nudge: a profile
 * stale for two years is still only asked about as often as the cooldown
 * allows, rather than every time the sweep runs.
 *
 * Null for everyone on deploy, which is correct — nobody has been asked yet.
 */
export class AddProfileStalePromptedAt1787700000000 implements MigrationInterface {
    name = 'AddProfileStalePromptedAt1787700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "stalePromptedAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "stalePromptedAt"`,
        );
    }
}
