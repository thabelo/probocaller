import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const OLD_TABLES = ['user', 'call', 'platform_config', 'business_profile', 'business_number', 'transaction'];

@Injectable()
export class DataMigrationService {
  private readonly logger = new Logger(DataMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  private async existingOldTables(): Promise<Set<string>> {
    const placeholders = OLD_TABLES.map((_, i) => `$${i + 1}`).join(',');
    const rows: { table_name: string }[] = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN (${placeholders})`,
      OLD_TABLES,
    );
    return new Set(rows.map((r) => r.table_name));
  }

  async run(): Promise<void> {
    const existing = await this.existingOldTables();

    if (existing.size === 0) {
      this.logger.log('No legacy tables found — skipping migration');
      return;
    }

    this.logger.log(`Migrating legacy tables: ${[...existing].join(', ')}`);

    if (existing.has('user')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM "user"`);
      if (Number(count) > 0) {
        await this.dataSource.query(`
          INSERT INTO users
            (id, "phoneNumber", email, name, "isSpam", role, "isBusiness", "walletBalance", "spamList", notifications, "createdAt", "updatedAt")
          SELECT
            _id, "phoneNumber", email, name, "isSpam", role, "isBusiness", "walletBalance", "spamList", notifications, "createdAt", "updatedAt"
          FROM "user"
          ON CONFLICT (id) DO NOTHING
        `);
        // Sync the sequence so new inserts don't clash
        await this.dataSource.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), MAX(id)) FROM users`);
        this.logger.log(`  users: migrated ${count} rows`);
      }
    }

    if (existing.has('call')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM "call"`);
      if (Number(count) > 0) {
        // Old call table may lack platformCut / userEarnings / ratePerSecond — default them
        // Old call table only had: id, fromUserId, toUserId, duration, cost, status, timestamp
        // Missing columns get defaults
        await this.dataSource.query(`
          INSERT INTO call_logs
            (id, "fromUserId", "toUserId", duration, cost, "platformCut", "userEarnings", "ratePerSecond", status, "startedAt")
          SELECT
            id, "fromUserId", "toUserId", duration, cost,
            0 AS "platformCut",
            0 AS "userEarnings",
            0.002 AS "ratePerSecond",
            status,
            timestamp AS "startedAt"
          FROM "call"
          ON CONFLICT (id) DO NOTHING
        `);
        await this.dataSource.query(`SELECT setval(pg_get_serial_sequence('call_logs', 'id'), MAX(id)) FROM call_logs`);
        this.logger.log(`  call_logs: migrated ${count} rows`);
      }
    }

    if (existing.has('platform_config')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM platform_config`);
      if (Number(count) > 0) {
        await this.dataSource.query(`
          INSERT INTO settings (key, value, "updatedAt")
          SELECT key, value, "updatedAt" FROM platform_config
          ON CONFLICT (key) DO NOTHING
        `);
        this.logger.log(`  settings: migrated ${count} rows`);
      }
    }

    if (existing.has('business_profile')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM business_profile`);
      if (Number(count) > 0) {
        await this.dataSource.query(`
          INSERT INTO businesses
            (id, "userId", "companyName", "registrationNumber", industry, website, description,
             "logoUrl", "contactEmail", "contactPhone", address, verified, active, "createdAt", "updatedAt")
          SELECT
            id, "userId", "companyName", "registrationNumber", industry, website, description,
            "logoUrl", "contactEmail", "contactPhone", address, verified, active, "createdAt", "updatedAt"
          FROM business_profile
          ON CONFLICT (id) DO NOTHING
        `);
        await this.dataSource.query(`SELECT setval(pg_get_serial_sequence('businesses', 'id'), MAX(id)) FROM businesses`);
        this.logger.log(`  businesses: migrated ${count} rows`);
      }
    }

    if (existing.has('business_number')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM business_number`);
      if (Number(count) > 0) {
        await this.dataSource.query(`
          INSERT INTO business_numbers
            (id, "businessId", "phoneNumber", purpose, label, active, "createdAt")
          SELECT
            id, "businessProfileId", "phoneNumber", purpose, label, active, "createdAt"
          FROM business_number
          ON CONFLICT (id) DO NOTHING
        `);
        await this.dataSource.query(`SELECT setval(pg_get_serial_sequence('business_numbers', 'id'), MAX(id)) FROM business_numbers`);
        this.logger.log(`  business_numbers: migrated ${count} rows`);
      }
    }

    if (existing.has('transaction')) {
      const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM "transaction"`);
      if (Number(count) > 0) {
        await this.dataSource.query(`
          INSERT INTO transactions
            (id, "userId", type, amount, description, "callId", "createdAt")
          SELECT
            id, "userId", type, amount, description, "callId", "createdAt"
          FROM "transaction"
          ON CONFLICT (id) DO NOTHING
        `);
        await this.dataSource.query(`SELECT setval(pg_get_serial_sequence('transactions', 'id'), MAX(id)) FROM transactions`);
        this.logger.log(`  transactions: migrated ${count} rows`);
      }
    }

    // Drop legacy tables — disable triggers to bypass FK constraints
    await this.dataSource.query(`SET session_replication_role = 'replica'`);
    for (const table of OLD_TABLES) {
      if (existing.has(table)) {
        await this.dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        this.logger.log(`  dropped legacy table: ${table}`);
      }
    }
    await this.dataSource.query(`SET session_replication_role = 'origin'`);

    this.logger.log('Migration complete');
  }
}
