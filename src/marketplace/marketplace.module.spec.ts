import 'reflect-metadata';
import { MarketplaceModule } from './marketplace.module';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
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
   * Other modules apply @RequiresApp with AppAccessGuard, which needs both the
   * guard and the context service resolvable from this module.
   */
  it('exports what other modules need to enforce app access', () => {
    const exports = Reflect.getMetadata('exports', MarketplaceModule) || [];
    expect(exports).toContain(AppAccessGuard);
    expect(exports).toContain(UserAccessContextService);
  });
});
