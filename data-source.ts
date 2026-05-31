import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { DataSource } from 'typeorm';
import { User } from './src/user/user.entity';
import { CallLog } from './src/call/call.entity';
import { CallRating } from './src/call/call-rating.entity';
import { Setting } from './src/config/setting.entity';
import { Business } from './src/business/business.entity';
import { BusinessNumber } from './src/business/business-number.entity';
import { Transaction } from './src/transaction/transaction.entity';
import { PhoneReport } from './src/report/phone-report.entity';
import { PhoneReportVote } from './src/report/phone-report-vote.entity';
import { CallPermissionRequest } from './src/data-broker/call-permission-request.entity';
import { ProfileField } from './src/profile/profile-field.entity';
import { UserProfile } from './src/profile/user-profile.entity';
import { DataAccessLog } from './src/profile/data-access-log.entity';
import { BusinessAudience } from './src/profile/business-audience.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User, CallLog, CallRating, Setting, Business, BusinessNumber,
    Transaction, PhoneReport, PhoneReportVote, CallPermissionRequest,
    ProfileField, UserProfile, DataAccessLog, BusinessAudience,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
