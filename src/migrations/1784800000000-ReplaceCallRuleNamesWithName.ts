import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom rules are now ONE named group (not a name per caller-type). Replace the
 * per-category callRuleNames JSON map with a single callRuleName string.
 */
export class ReplaceCallRuleNamesWithName1784800000000 implements MigrationInterface {
  name = 'ReplaceCallRuleNamesWithName1784800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "callRuleNames"`);
    await q.query(`ALTER TABLE "users" ADD "callRuleName" character varying NOT NULL DEFAULT ''`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "callRuleName"`);
    await q.query(`ALTER TABLE "users" ADD "callRuleNames" text NOT NULL DEFAULT '{}'`);
  }
}
