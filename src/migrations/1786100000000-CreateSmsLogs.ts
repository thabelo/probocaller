import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user SMS activity log (src/sms-log/). One row per SMS a device
 * evaluates against the user's SMS policy or blocks via keyword matching.
 * `bodyHash` is an MD5 hash computed on-device — the message text itself
 * never reaches the server.
 */
export class CreateSmsLogs1786100000000 implements MigrationInterface {
  name = 'CreateSmsLogs1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "sms_logs" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "address" character varying NOT NULL, "bodyHash" character varying NOT NULL, "category" character varying NOT NULL, "decision" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sms_logs" PRIMARY KEY ("id"))`,
    );
    // The admin per-user query filters on exactly this column.
    await queryRunner.query(`CREATE INDEX "IDX_sms_logs_userId" ON "sms_logs" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_sms_logs_userId"`);
    await queryRunner.query(`DROP TABLE "sms_logs"`);
  }
}
