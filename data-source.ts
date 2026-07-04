import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { DataSource } from 'typeorm';
import { ENTITIES } from './src/common/db/entities';

// ENTITIES is the single canonical list, shared with the runtime config in
// src/app.module.ts. Registering it here means the migration CLI (generate/run)
// sees exactly the same schema the app does — no more silent table drift, which
// is what left 13 tables (Withdrawal, BankAccount, messaging, KYB, FICA, …) out
// of the migration schema and made a fresh-DB deploy impossible.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ENTITIES,
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
