import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { User } from '../user/user.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { LeadsController } from './leads.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BusinessNumber, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ProfileModule,
  ],
  controllers: [BusinessController, LeadsController],
  providers: [BusinessService, ApiKeyGuard],
  exports: [BusinessService],
})
export class BusinessModule {}
