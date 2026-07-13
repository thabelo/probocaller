import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds callRuleNames — a JSON map of category (contacts|business|newCaller|unknown)
 * to a user-given name for that custom override rule.
 */
export class AddCallRuleNames1784700000000 implements MigrationInterface {
  name = 'AddCallRuleNames1784700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "callRuleNames" text NOT NULL DEFAULT '{}'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "callRuleNames"`);
  }
}
