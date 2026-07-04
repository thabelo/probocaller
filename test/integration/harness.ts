import { config as loadEnv } from 'dotenv';
loadEnv();

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../../src/common/db/entities';

/**
 * Integration test harness.
 *
 * Builds a Nest TestingModule wired to a REAL Postgres database (the canonical
 * ENTITIES list, no synchronize) so integration specs exercise actual SQL —
 * catching the kind of issues mocked unit tests can't (locking, IS NULL
 * semantics, cascades, real type coercion).
 *
 * Point it at a disposable DB via INTEGRATION_DB_NAME (falls back to DB_NAME).
 * Run with: npm run test:integration
 */
export async function createIntegrationModule(imports: any[] = []): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.INTEGRATION_DB_NAME || process.env.DB_NAME,
        entities: ENTITIES,
        synchronize: false,
        logging: false,
      }),
      ...imports,
    ],
  }).compile();
}
