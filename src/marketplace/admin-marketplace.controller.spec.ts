import { AdminGuard } from '../admin/admin.guard';
import { AdminMarketplaceController } from './admin-marketplace.controller';

/**
 * Admin catalogue API.
 *
 * Separate from MarketplaceController because the audience is different: this
 * one is guarded by AdminGuard rather than a plain JWT, and returns raw
 * catalogue rows instead of per-user state.
 */
describe('AdminMarketplaceController', () => {
  const make = () => {
    const service = {
      listAllApps: jest.fn().mockResolvedValue([{ key: 'data-broker' }]),
      updateApp: jest.fn().mockResolvedValue({ key: 'surveys', status: 'live' }),
    };
    return { service, controller: new AdminMarketplaceController(service as any) };
  };

  /**
   * The catalogue is admin-managed and its edits are money- and consent-
   * adjacent, so this must never fall back to the ordinary JWT guard.
   */
  it('is guarded by AdminGuard, not the plain JWT guard', () => {
    const guards = Reflect.getMetadata('__guards__', AdminMarketplaceController) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('lists the whole catalogue, retired rows included', async () => {
    const { service, controller } = make();

    await controller.list();

    expect(service.listAllApps).toHaveBeenCalled();
  });

  it('passes an edit through to the service, keyed by app key', async () => {
    const { service, controller } = make();

    const result = await controller.update('surveys', { status: 'live' } as any);

    expect(service.updateApp).toHaveBeenCalledWith('surveys', { status: 'live' });
    expect(result.status).toBe('live');
  });
});
