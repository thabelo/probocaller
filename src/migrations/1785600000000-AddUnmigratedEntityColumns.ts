import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Six columns that entities declared but no migration ever created.
 *
 * Dev runs synchronize:true, so each of these worked the moment it was typed
 * and every test stayed green. Production runs migrations only, so the columns
 * simply were not there — and TypeORM SELECTs every column of an entity, so a
 * single missing one breaks queries that never mention it. Production logged
 * 2537 "column …business.walletBalance does not exist" errors, which is what
 * caller-ID lookups and the privacy screen were failing on.
 *
 * Definitions here mirror the entity decorators exactly. All are nullable or
 * defaulted, so existing rows are valid without a backfill.
 */
export class AddUnmigratedEntityColumns1785600000000 implements MigrationInterface {
  name = 'AddUnmigratedEntityColumns1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Business.walletBalance — @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "walletBalance" numeric(12,4) NOT NULL DEFAULT '0'`,
    );

    // ApiKey.maxSpendPerCall — nullable, null = uncapped
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "maxSpendPerCall" numeric(12,4)`,
    );

    // Transaction.businessId — set when money moved through a business wallet
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "businessId" integer`,
    );

    // CallPermissionRequest.freeCall — inside a granted free window
    await queryRunner.query(
      `ALTER TABLE "call_permission_requests" ADD COLUMN IF NOT EXISTS "freeCall" boolean NOT NULL DEFAULT false`,
    );

    // DataCertificate provenance — which API key minted the certificate
    await queryRunner.query(
      `ALTER TABLE "data_certificates" ADD COLUMN IF NOT EXISTS "apiKeyId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "data_certificates" ADD COLUMN IF NOT EXISTS "sourceLabel" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "data_certificates" DROP COLUMN IF EXISTS "sourceLabel"`);
    await queryRunner.query(`ALTER TABLE "data_certificates" DROP COLUMN IF EXISTS "apiKeyId"`);
    await queryRunner.query(`ALTER TABLE "call_permission_requests" DROP COLUMN IF EXISTS "freeCall"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "businessId"`);
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "maxSpendPerCall"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "walletBalance"`);
  }
}
