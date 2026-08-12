import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the global, admin-managed scam_keywords table (src/scam-keyword/)
 * with the same 17-word baseline list the mobile app has historically
 * shipped hardcoded in SmsService.tsx (DEFAULT_SCAM_KEYWORDS). This gives
 * that baseline a real server source of truth for the first time so it can
 * be synced via GET /scam-keywords/sync and updated centrally going forward.
 */
export class SeedDefaultScamKeywords1786300000000 implements MigrationInterface {
  name = 'SeedDefaultScamKeywords1786300000000';

  private readonly keywords = [
    'prize',
    'won',
    'winner',
    'claim',
    'lottery',
    'click here',
    'verify',
    'suspended',
    'gift card',
    'bitcoin',
    'crypto',
    'wire transfer',
    'otp',
    'one-time pin',
    'urgent',
    'act now',
    'password',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const keyword of this.keywords) {
      await queryRunner.query(
        // $1 is cast explicitly: Postgres cannot infer a parameter's type from a
        // SELECT output position, and the comparison below deduces a different
        // one, which aborts the whole migration run.
        `INSERT INTO "scam_keywords" ("keyword", "active") SELECT $1::varchar, true WHERE NOT EXISTS (SELECT 1 FROM "scam_keywords" WHERE "keyword" = $1::varchar)`,
        [keyword],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: this is a data-seed migration, not a schema
    // migration. Reversing it by deleting rows matching these keywords risks
    // deleting admin-added duplicates or keywords now referenced elsewhere
    // (e.g. sms_logs.matchedKeyword), and this repo has no other seed
    // migration establishing a different down() convention to follow
    // (seedDefaultConfig() in admin.service.ts, the closest analogue, is an
    // application-level idempotent seed with no "unseed" counterpart either).
    void queryRunner;
  }
}
