import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the launch catalogue.
 *
 * Each two-sided product is TWO apps, because an app has exactly one audience:
 * the person supplying data or answers, and the company paying for them. They
 * are linked by `pairedAppKey` for admin and analytics only — users never see
 * the pairing.
 *
 * Databroker and Audience & Leads go out live (their screens already ship).
 * The Surveys pair is seeded as coming_soon so the storefront can announce it
 * before the screens exist; releasing it is an UPDATE, not a deploy.
 *
 * ON CONFLICT DO NOTHING keeps this safe to re-run and stops it clobbering
 * copy that an admin has since edited in the panel.
 */
export class SeedMarketplaceApps1786500000000 implements MigrationInterface {
  name = 'SeedMarketplaceApps1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "apps"
        ("key", "name", "tagline", "icon", "category", "audience", "status", "requiresKyb", "pairedAppKey")
      VALUES
        ('data-broker', 'Databroker',
         'Get paid when businesses use your profile data.',
         'BanknotesIcon', 'earn', 'user', 'live', false, 'audience-leads'),
        ('audience-leads', 'Audience & Leads',
         'Buy verified audience data. Pay only for what you use.',
         'UserGroupIcon', 'business', 'business', 'live', true, 'data-broker'),
        ('surveys', 'Surveys',
         'Answer surveys from businesses. Get paid per answer.',
         'ClipboardDocumentListIcon', 'earn', 'user', 'coming_soon', false, 'survey-campaigns'),
        ('survey-campaigns', 'Survey Campaigns',
         'Publish surveys and pay respondents directly.',
         'MegaphoneIcon', 'business', 'business', 'coming_soon', true, 'surveys')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "apps" WHERE "key" IN ('data-broker', 'audience-leads', 'surveys', 'survey-campaigns')`,
    );
  }
}
