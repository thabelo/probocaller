import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { App } from './app.entity';
import { AppInstall } from './app-install.entity';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { AdminMarketplaceController } from './admin-marketplace.controller';
import { UserAccessContextService } from './user-access-context.service';
import { AppAccessGuard } from './app-access.guard';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([App, AppInstall, User, Business]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [MarketplaceController, AdminMarketplaceController],
  // AdminGuard is provided here, not just imported: AdminMarketplaceController
  // is declared in this module, so Nest resolves its guard from this injector.
  providers: [MarketplaceService, UserAccessContextService, AppAccessGuard, AdminGuard],
  // Exported so feature modules can apply @RequiresApp + AppAccessGuard to
  // their own routes instead of re-deriving entitlement locally.
  exports: [MarketplaceService, UserAccessContextService, AppAccessGuard],
})
export class MarketplaceModule {}
