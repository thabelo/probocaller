import { MarketplaceController } from './marketplace.controller';

/**
 * The storefront API.
 *
 * Every route derives the user from the JWT, never from the request body — a
 * caller must not be able to install an app for someone else, or read another
 * user's entitlements, by passing an id.
 */
describe('MarketplaceController', () => {
  const ctx = { hasBusinessAccess: false, kybVerified: false };

  const make = () => {
    const service = {
      listApps: jest.fn().mockResolvedValue([{ key: 'data-broker', state: 'available' }]),
      installApp: jest.fn().mockResolvedValue({ id: 1 }),
      uninstall: jest.fn().mockResolvedValue(undefined),
      installedKeys: jest.fn().mockResolvedValue(new Set(['data-broker'])),
    };
    const contextService = { forUser: jest.fn().mockResolvedValue(ctx) };
    return {
      service,
      contextService,
      controller: new MarketplaceController(service as any, contextService as any),
    };
  };

  const req = { user: { userId: 7 } } as any;

  it('lists apps for the authenticated user', async () => {
    const { controller, service } = make();
    await controller.list(req);
    expect(service.listApps).toHaveBeenCalledWith(7, ctx);
  });

  it('installs against the authenticated user, not a supplied id', async () => {
    const { controller, service } = make();
    await controller.install(req, 'data-broker');
    expect(service.installApp).toHaveBeenCalledWith(7, 'data-broker', ctx);
  });

  it('uninstalls against the authenticated user', async () => {
    const { controller, service } = make();
    await controller.uninstall(req, 'data-broker');
    expect(service.uninstall).toHaveBeenCalledWith(7, 'data-broker');
  });

  it('returns entitlements as a plain array the client can cache', async () => {
    const { controller } = make();
    await expect(controller.myApps(req)).resolves.toEqual({ apps: ['data-broker'] });
  });
});
