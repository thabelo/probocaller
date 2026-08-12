import 'reflect-metadata';
import { MarketplaceModule } from './marketplace.module';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { AdminMarketplaceController } from './admin-marketplace.controller';
import { AdminGuard } from '../admin/admin.guard';
import { AppAccessGuard } from './app-access.guard';
import { UserAccessContextService } from './user-access-context.service';

/**
 * The service is exported because other modules enforce access with it —
 * data-broker gates its endpoints on `canAccess` rather than re-deriving
 * entitlement locally. Dropping the export would let each module invent its own
 * answer to "does this user have the app?".
 */
describe('MarketplaceModule', () => {
  it('exports the service so other modules can gate on it', () => {
    const providers = Reflect.getMetadata('providers', MarketplaceModule) || [];
    const exports = Reflect.getMetadata('exports', MarketplaceModule) || [];
    expect(providers).toContain(MarketplaceService);
    expect(exports).toContain(MarketplaceService);
  });

  it('registers the storefront controller', () => {
    const controllers = Reflect.getMetadata('controllers', MarketplaceModule) || [];
    expect(controllers).toContain(MarketplaceController);
  });

  /**
   * AdminGuard injects the User repository, so it has to be resolvable from
   * THIS module's injector — a guard Nest cannot construct fails at request
   * time, not at boot, which is the worst way to find out.
   */
  it('provides the AdminGuard its admin controller depends on', () => {
    const providers = Reflect.getMetadata('providers', MarketplaceModule) || [];
    expect(providers).toContain(AdminGuard);
  });

  /** Without this the admin panel's catalogue screen has no API to call. */
  it('registers the admin catalogue controller', () => {
    const controllers = Reflect.getMetadata('controllers', MarketplaceModule) || [];
    expect(controllers).toContain(AdminMarketplaceController);
  });

  /**
   * Other modules apply @RequiresApp with AppAccessGuard, which needs both the
   * guard and the context service resolvable from this module.
   */
  it('exports what other modules need to enforce app access', () => {
    const exports = Reflect.getMetadata('exports', MarketplaceModule) || [];
    expect(exports).toContain(AppAccessGuard);
    expect(exports).toContain(UserAccessContextService);
  });
});
