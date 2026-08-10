import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { WhitelistedNumber } from './business-whitelist.entity';
import { BusinessWhitelistService } from './business-whitelist.service';
import { AdminBusinessWhitelistController } from './admin-business-whitelist.controller';
import { BusinessWhitelistController } from './business-whitelist.controller';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhitelistedNumber, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AdminBusinessWhitelistController, BusinessWhitelistController],
  providers: [BusinessWhitelistService, AdminGuard],
  exports: [BusinessWhitelistService],
})
export class BusinessWhitelistModule {}
