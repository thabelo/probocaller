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
      listAppsForAdmin: jest
        .fn()
        .mockResolvedValue([{ key: 'data-broker', activeInstalls: 4, totalInstalls: 6 }]),
      listAppInstalls: jest.fn().mockResolvedValue({ total: 0, rows: [] }),
      installTrend: jest.fn().mockResolvedValue([]),
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

  /** The admin table shows uptake, so the list must carry the counts. */
  it('lists the whole catalogue with install counts', async () => {
    const { service, controller } = make();

    await controller.list();

    expect(service.listAppsForAdmin).toHaveBeenCalled();
  });

  it('lists who installed a given app', async () => {
    const { service, controller } = make();

    await controller.installs('data-broker', undefined, undefined);

    expect(service.listAppInstalls).toHaveBeenCalledWith('data-broker', 50, 0);
  });

  it('serves the installs-vs-removals trend', async () => {
    const { service, controller } = make();

    await controller.trend(undefined, undefined);

    expect(service.installTrend).toHaveBeenCalledWith(30, undefined);
  });

  it('narrows the trend to one app and honours a day range', async () => {
    const { service, controller } = make();

    await controller.trend('90', 'data-broker');

    expect(service.installTrend).toHaveBeenCalledWith(90, 'data-broker');
  });

  it('passes paging through as numbers, not strings', async () => {
    const { service, controller } = make();

    await controller.installs('data-broker', '25', '50');

    expect(service.listAppInstalls).toHaveBeenCalledWith('data-broker', 25, 50);
  });

  it('passes an edit through to the service, keyed by app key', async () => {
    const { service, controller } = make();

    const result = await controller.update('surveys', { status: 'live' } as any);

    expect(service.updateApp).toHaveBeenCalledWith('surveys', { status: 'live' });
    expect(result.status).toBe('live');
  });
});
