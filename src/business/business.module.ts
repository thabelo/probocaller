import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { BusinessLogoController } from './business-logo.controller';
import { BusinessLogoService } from './business-logo.service';
import { LeadsController } from './leads.controller';
import { BusinessNumberSyncController } from './business-number-sync.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ProfileModule } from '../profile/profile.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BusinessNumber, ApiKey, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ProfileModule,
    TransactionModule,
    ConfigModule,
  ],
  controllers: [BusinessController, BusinessLogoController, LeadsController, BusinessNumberSyncController],
  providers: [BusinessService, BusinessLogoService, ApiKeyGuard],
  exports: [BusinessService],
})
export class BusinessModule {}
