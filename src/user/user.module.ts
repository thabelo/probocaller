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
import { ReportModule } from '../report/report.module';
import { DataBrokerModule } from '../data-broker/data-broker.module';
import { LookupModule } from '../lookup/lookup.module';
import { JWT_SECRET } from '../app.module';
import { Setting } from '../config/setting.entity';

@Module({
  imports: [
    // Setting: the caller-ID lookup surfaces the live RATE_PER_SECOND.
    TypeOrmModule.forFeature([User, Setting]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: {},
    }),
    forwardRef(() => BusinessModule),
    TransactionModule,
    ReportModule,
    InviteModule,
    forwardRef(() => DataBrokerModule),
    LookupModule,
  ],
  providers: [
    UserService,
    JwtStrategy,
    // Factory-provided so its numeric/clock constructor args aren't injected.
    { provide: ExternalLookupRateLimiter, useFactory: () => new ExternalLookupRateLimiter() },
  ],
  controllers: [UserController],
  // Export the limiter too: UserController is also declared in AppModule's
  // controllers, so its dependencies must be resolvable in AppModule's scope.
  exports: [UserService, ExternalLookupRateLimiter],
})
export class UserModule {}