import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ExternalLookupRateLimiter } from './external-lookup-rate-limiter';
import { JwtStrategy } from '../auth/jwt.strategy';
import { BusinessModule } from '../business/business.module';
import { TransactionModule } from '../transaction/transaction.module';
import { InviteModule } from '../invite/invite.module';
import { TransferModule } from '../transfer/transfer.module';
import { ReportModule } from '../report/report.module';
import { DataBrokerModule } from '../data-broker/data-broker.module';
import { LookupModule } from '../lookup/lookup.module';
import { JWT_SECRET } from '../app.module';
import { ConfigModule, SETTINGS_SEEDED } from '../config/config.module';
import { SettingsReaderService } from '../config/settings-reader.service';
import { ReferralModule } from '../referral/referral.module';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: {},
    }),
    forwardRef(() => BusinessModule),
    TransactionModule,
    ReportModule,
    InviteModule,
    TransferModule,
    forwardRef(() => DataBrokerModule),
    LookupModule,
    ConfigModule,
    // ReferralService.getCommissionRate() backs GET /user/rate's
    // referralCommissionRate, via the SAME reader payCommission() uses.
    ReferralModule,
  ],
  providers: [
    UserService,
    AvatarService,
    JwtStrategy,
    // tryAcquire() runs on the caller-ID hot path and must stay fully
    // synchronous, so it can't read live settings per-call. Instead this
    // ASYNC factory resolves EXTERNAL_LOOKUP_MAX_PER_WINDOW /
    // EXTERNAL_LOOKUP_WINDOW_MS from the admin-configurable settings table
    // ONCE, at module-init time (Nest awaits async factories before the app
    // serves any request), and passes them into the constructor explicitly.
    //
    // SETTINGS_SEEDED is injected purely for ORDERING: this factory runs
    // during provider instantiation, which is strictly before onModuleInit
    // where bootstrap seeding used to happen — so on a database missing
    // either row, the read below threw and the app crash-looped without ever
    // being able to seed itself. Depending on the token forces the seed first.
    {
      provide: ExternalLookupRateLimiter,
      useFactory: async (settingsReader: SettingsReaderService, _seeded: boolean) => {
        const [max, windowMs] = await Promise.all([
          settingsReader.getNumber('EXTERNAL_LOOKUP_MAX_PER_WINDOW'),
          settingsReader.getNumber('EXTERNAL_LOOKUP_WINDOW_MS'),
        ]);
        return new ExternalLookupRateLimiter(max, windowMs);
      },
      inject: [SettingsReaderService, SETTINGS_SEEDED],
    },
  ],
  controllers: [UserController, AvatarController],
  // Export the limiter too: UserController is also declared in AppModule's
  // controllers, so its dependencies must be resolvable in AppModule's scope.
  exports: [UserService, ExternalLookupRateLimiter],
})
export class UserModule {}