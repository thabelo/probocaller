import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtStrategy } from '../auth/jwt.strategy';
import { BusinessModule } from '../business/business.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ReportModule } from '../report/report.module';
import { DataBrokerModule } from '../data-broker/data-broker.module';
import { LookupModule } from '../lookup/lookup.module';
import { JWT_SECRET } from '../app.module';

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
    forwardRef(() => DataBrokerModule),
    LookupModule,
  ],
  providers: [UserService, JwtStrategy],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}