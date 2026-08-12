import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { App } from './app.entity';
import { AppInstall } from './app-install.entity';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { UserAccessContextService } from './user-access-context.service';
import { AppAccessGuard } from './app-access.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([App, AppInstall, User, Business]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, UserAccessContextService, AppAccessGuard],
  // Exported so feature modules can apply @RequiresApp + AppAccessGuard to
  // their own routes instead of re-deriving entitlement locally.
  exports: [MarketplaceService, UserAccessContextService, AppAccessGuard],
})
export class MarketplaceModule {}
