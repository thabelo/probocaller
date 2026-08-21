import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A history of profile field changes, for the admin console.
 *
 * A profile holds the current state; this holds the trajectory, and the
 * trajectory says more — "household went 2 to 3 in March", "income band rose
 * twice this year" are life events rather than attributes. So the table is
 * admin-only, ages out through the retention purge, and cascades from users so
 * an erasure takes the history with it.
 *
 * Two indexes for the two questions asked of it: one person's history, and
 * everyone's activity over a date range.
 */
export class CreateProfileChangeLogs1787600000000 implements MigrationInterface {
    name = 'CreateProfileChangeLogs1787600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_change_logs" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "actorUserId" integer,
            "fieldKey" character varying(64) NOT NULL,
            "oldValue" text,
            "newValue" text,
            "changeKind" character varying(16) NOT NULL,
            "changedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_profile_change_logs" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_profile_change_logs_user_changedAt" ON "profile_change_logs" ("userId", "changedAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_profile_change_logs_changedAt" ON "profile_change_logs" ("changedAt")`,
        );
        await queryRunner.query(
            `ALTER TABLE "profile_change_logs" ADD CONSTRAINT "FK_profile_change_logs_user"
             FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "profile_change_logs"`);
    }
}
