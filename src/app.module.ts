import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { User } from './user/user.entity';
import { UserModule } from './user/user.module';
import { UserController } from './user/user.controller';
import { AuthController } from './auth/auth.controller';
import { UserService } from './user/user.service';
import { JwtStrategy } from './auth/jwt.strategy';

import { CallLog } from './call/call.entity';
import { CallRating } from './call/call-rating.entity';
import { CallModule } from './call/call.module';

import { CallPermissionRequest } from './data-broker/call-permission-request.entity';
import { DataBrokerModule } from './data-broker/data-broker.module';

import { Setting } from './config/setting.entity';
import { AdminModule } from './admin/admin.module';
import { AdminService } from './admin/admin.service';

import { Business } from './business/business.entity';
import { BusinessNumber } from './business/business-number.entity';
import { BusinessModule } from './business/business.module';
import { CampaignModule } from './campaign/campaign.module';

import { Transaction } from './transaction/transaction.entity';
import { TransactionModule } from './transaction/transaction.module';

import { DataMigrationModule } from './migration/data-migration.module';
import { DataMigrationService } from './migration/data-migration.service';

import { LookupModule } from './lookup/lookup.module';
import { ScamShieldModule } from './scam-shield/scam-shield.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ScreeningModule } from './screening/screening.module';
import { CallScreening } from './screening/call-screening.entity';
import { ReportModule } from './report/report.module';
import { PhoneReport } from './report/phone-report.entity';
import { PhoneReportVote } from './report/phone-report-vote.entity';

import { ProfileModule } from './profile/profile.module';
import { FxModule } from './fx/fx.module';
import { ProfileService } from './profile/profile.service';
import { ProfileField } from './profile/profile-field.entity';
import { UserProfile } from './profile/user-profile.entity';
import { DataAccessLog } from './profile/data-access-log.entity';
import { BusinessAudience } from './profile/business-audience.entity';

import { KybModule } from './kyb/kyb.module';
import { KybSubmission } from './kyb/entities/kyb-submission.entity';
import { KybDocument } from './kyb/entities/kyb-document.entity';
import { BlockedKeyword } from './blocked-keyword/blocked-keyword.entity';
import { BlockedKeywordModule } from './blocked-keyword/blocked-keyword.module';
import { SmsDeletionLog } from './sms-deletion-log/sms-deletion-log.entity';
import { SmsDeletionLogModule } from './sms-deletion-log/sms-deletion-log.module';
import { SpamReport } from './spam-report/spam-report.entity';
import { SpamReportModule } from './spam-report/spam-report.module';
import { ReportedSms } from './reported-sms/reported-sms.entity';
import { ReportedSmsModule } from './reported-sms/reported-sms.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ErrorLogModule } from './error-log/error-log.module';
import { AuditModule } from './audit/audit.module';
import { RetentionModule } from './retention/retention.module';
import { LegalModule } from './legal/legal.module';
import { ConsentModule } from './consent/consent.module';

import { BankAccountModule } from './bank-account/bank-account.module';
import { BankAccount } from './bank-account/bank-account.entity';
import { FicaModule } from './fica/fica.module';
import { FicaSubmission } from './fica/entities/fica-submission.entity';
import { FicaDocument } from './fica/entities/fica-document.entity';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { AirtimeModule } from './airtime/airtime.module';
import { SuppressionModule } from './suppression/suppression.module';
import { Withdrawal } from './withdrawal/withdrawal.entity';
import { Conversation } from './messaging/conversation.entity';
import { Message } from './messaging/message.entity';
import { ENTITIES } from './common/db/entities';
import { TransferModule } from './transfer/transfer.module';
import { BanksModule } from './banks/banks.module';
import { HealthModule } from './health/health.module';
import { AppLoggerModule } from './common/logging/logger.module';
import { GdprModule } from './gdpr/gdpr.module';
import { MessagingModule } from './messaging/messaging.module';
import { shouldRunMigrations } from './common/db/should-run-migrations';
import * as path from 'path';

// ── Required env vars — fail fast at startup if missing ──────────────────────
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `See .env.example for the full list of required variables.`,
    );
  }
  return value;
}

// JWT secret must be set explicitly — no insecure fallback.
// Generate one with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
export const JWT_SECRET = requireEnv('JWT_SECRET');
if (JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be at least 32 characters. ' +
    'Generate a strong one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
  );
}

// ENTITIES is the single canonical list, shared with the migration CLI via
// data-source.ts (see src/common/db/entities.ts). Both must use the same list
// so the runtime schema and the migration schema can never drift.

const isProduction = process.env.NODE_ENV === 'production';
const runMigrationsOnBoot = shouldRunMigrations(process.env);

@Module({
  imports: [
    AppLoggerModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: requireEnv('DB_HOST'),
      port: parseInt(requireEnv('DB_PORT'), 10),
      username: requireEnv('DB_USER'),
      password: requireEnv('DB_PASSWORD'),
      database: requireEnv('DB_NAME'),
      entities: ENTITIES,
      // Migrations live under src/migrations/*.ts and compile to dist/migrations/*.js.
      // We point at both so the same config works in ts-node dev runs and in the
      // compiled prod container.
      migrations: [
        path.join(__dirname, 'migrations', '*.{ts,js}'),
      ],
      // When migrationsRun is true, TypeORM applies pending migrations on
      // DataSource initialisation — before any module hooks fire. This makes
      // the container start be "schema-up-to-date or die" without an external
      // step. Triggered automatically in production (or RUN_MIGRATIONS=true).
      migrationsRun: runMigrationsOnBoot,
      // synchronize is mutually exclusive with migrations: never run schema
      // auto-sync when we're applying migrations, and never run it in
      // production regardless.
      synchronize: !isProduction && !runMigrationsOnBoot,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: {},
    }),
    // Global rate limiting: 60 requests / minute per IP.
    // Auth endpoints get stricter per-endpoint @Throttle() overrides.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    TypeOrmModule.forFeature([User, Business]),
    UserModule,
    CallModule,
    AdminModule,
    BusinessModule,
    CampaignModule,
    TransactionModule,
    DataMigrationModule,
    LookupModule,
    ScamShieldModule,
    SubscriptionModule,
    ScreeningModule,
    ReportModule,
    DataBrokerModule,
    ProfileModule,
    FxModule,
    KybModule,
    BlockedKeywordModule,
    SmsDeletionLogModule,
    SpamReportModule,
    ReportedSmsModule,
    FeedbackModule,
    ErrorLogModule,
    AuditModule,
    RetentionModule,
    LegalModule,
    ConsentModule,
    BankAccountModule,
    FicaModule,
    WithdrawalModule,
    AirtimeModule,
    SuppressionModule,
    TransferModule,
    BanksModule,
    HealthModule,
    GdprModule,
    MessagingModule,
  ],
  controllers: [UserController, AuthController],
  providers: [
    UserService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(
    private readonly migrationService: DataMigrationService,
    private readonly adminService: AdminService,
    private readonly profileService: ProfileService,
  ) {}

  async onModuleInit() {
    if (isProduction) {
      this.logger.log('Production mode — skipping auto data migration. Run migrations explicitly.');
    } else {
      await this.migrationService.run();
    }
    await this.adminService.seedDefaultConfig();
    await this.profileService.seedDefaultFields();
  }
}
