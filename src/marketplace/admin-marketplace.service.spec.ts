import { MarketplaceService } from './marketplace.service';

/**
 * Admin catalogue management.
 *
 * The catalogue is admin-managed: releasing an app is a status change, not a
 * deploy, and the launch seed deliberately does not clobber copy an admin has
 * edited. Both of those promises need an admin read and an admin write.
 *
 * Deliberately edit-only. An app row is inert without screens shipped in the
 * mobile binary, and `key` is a code dependency, so there is no create and no
 * delete — withdrawing an app is `status: 'retired'`.
 */
describe('MarketplaceService — admin catalogue', () => {
  const app = (key: string, status: string) => ({ key, name: key, status });

  describe('listAllApps', () => {
    it('includes retired apps, which the storefront hides', async () => {
      const appRepo = {
        find: jest.fn(async () => [
          app('data-broker', 'live'),
          app('surveys', 'coming_soon'),
          app('legacy', 'retired'),
        ]),
      };
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      const keys = (await service.listAllApps()).map((a) => a.key);

      expect(keys).toEqual(['data-broker', 'surveys', 'legacy']);
    });
  });

  /** A chainable query-builder stub that yields the given raw rows. */
  const qbWith = (rows: any[]) => {
    const qb: any = {};
    for (const m of ['select', 'addSelect', 'groupBy', 'where', 'andWhere']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(async () => rows);
    return qb;
  };

  describe('listAppsForAdmin', () => {
    const appRepo = {
      find: jest.fn(async () => [app('data-broker', 'live'), app('surveys', 'coming_soon')]),
    };

    it('reports how many people have each app', async () => {
      const installRepo = {
        createQueryBuilder: jest.fn(() =>
          qbWith([{ appKey: 'data-broker', active: '4', total: '6' }]),
        ),
      };
      const service = new MarketplaceService(installRepo as any, appRepo as any, {} as any);

      const byKey = Object.fromEntries(
        (await service.listAppsForAdmin()).map((a) => [a.key, a]),
      );

      expect(byKey['data-broker'].activeInstalls).toBe(4);
      expect(byKey['data-broker'].totalInstalls).toBe(6);
    });

    /**
     * An app nobody has installed must read as zero, not as missing — an absent
     * number in the admin table is indistinguishable from a broken query.
     */
    it('reports zero for an app nobody has installed', async () => {
      const installRepo = {
        createQueryBuilder: jest.fn(() => qbWith([])),
      };
      const service = new MarketplaceService(installRepo as any, appRepo as any, {} as any);

      const byKey = Object.fromEntries(
        (await service.listAppsForAdmin()).map((a) => [a.key, a]),
      );

      expect(byKey['surveys'].activeInstalls).toBe(0);
      expect(byKey['surveys'].totalInstalls).toBe(0);
    });
  });

  describe('listAppInstalls', () => {
    const makeService = (installs: any[], users: any[]) =>
      new MarketplaceService(
        {
          findAndCount: jest.fn(async () => [installs, installs.length]),
        } as any,
        { findOne: jest.fn(async () => app('data-broker', 'live')) } as any,
        { findByIds: jest.fn(async () => users) } as any,
      );

    it('names who installed, not just how many', async () => {
      const service = makeService(
        [{ userId: 7, installedAt: new Date('2026-08-01'), uninstalledAt: null }],
        [{ id: 7, name: 'Thabelo', phoneNumber: '+27821234567' }],
      );

      const { total, rows } = await service.listAppInstalls('data-broker');

      expect(total).toBe(1);
      expect(rows[0]).toMatchObject({
        userId: 7,
        name: 'Thabelo',
        phoneNumber: '+27821234567',
      });
    });

    /**
     * Uninstall is a soft revoke and, for Databroker, the row IS the record of
     * data-sharing consent — so a withdrawal has to stay visible and dated,
     * not vanish from the admin view.
     */
    it('keeps revoked installs visible, with the date they were withdrawn', async () => {
      const revokedOn = new Date('2026-08-10');
      const service = makeService(
        [{ userId: 9, installedAt: new Date('2026-08-01'), uninstalledAt: revokedOn }],
        [{ id: 9, name: 'Someone', phoneNumber: '+27829999999' }],
      );

      const { rows } = await service.listAppInstalls('data-broker');

      expect(rows[0].uninstalledAt).toEqual(revokedOn);
    });

    /** A deleted user must not blank the row — the consent record still stands. */
    it('still lists an install whose user record has gone', async () => {
      const service = makeService(
        [{ userId: 404, installedAt: new Date('2026-08-01'), uninstalledAt: null }],
        [],
      );

      const { rows } = await service.listAppInstalls('data-broker');

      expect(rows[0]).toMatchObject({ userId: 404, name: null, phoneNumber: null });
    });

    it('rejects an unknown app rather than returning an empty list', async () => {
      const service = new MarketplaceService(
        { findAndCount: jest.fn() } as any,
        { findOne: jest.fn(async () => null) } as any,
        {} as any,
      );

      await expect(service.listAppInstalls('ghost')).rejects.toThrow(/ghost/);
    });

    /** An admin table must not be able to ask for the whole table at once. */
    it('caps how many rows one request can pull', async () => {
      const installRepo = { findAndCount: jest.fn(async () => [[], 0]) };
      const service = new MarketplaceService(
        installRepo as any,
        { findOne: jest.fn(async () => app('data-broker', 'live')) } as any,
        { findByIds: jest.fn(async () => []) } as any,
      );

      await service.listAppInstalls('data-broker', 5000, 0);

      expect(installRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  describe('updateApp', () => {
    const repoWith = (existing: any) => ({
      findOne: jest.fn(async () => existing),
      save: jest.fn(async (a: any) => a),
    });

    /** Releasing a coming_soon app is an UPDATE, not a deploy. */
    it('releases an app by changing its status', async () => {
      const appRepo = repoWith(app('surveys', 'coming_soon'));
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      const updated = await service.updateApp('surveys', { status: 'live' });

      expect(updated.status).toBe('live');
      expect(appRepo.save).toHaveBeenCalled();
    });

    it('edits the copy an admin owns', async () => {
      const appRepo = repoWith(app('surveys', 'coming_soon'));
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      const updated = await service.updateApp('surveys', {
        name: 'Paid Surveys',
        tagline: 'Answer questions, get paid.',
      });

      expect(updated.name).toBe('Paid Surveys');
      expect(updated.tagline).toBe('Answer questions, get paid.');
    });

    /**
     * `key` is what the mobile binary switches on to find an app's screens, so
     * renaming one would orphan a shipped feature. It is not editable.
     */
    it('refuses to change the key, which code depends on', async () => {
      const appRepo = repoWith(app('surveys', 'coming_soon'));
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      const updated = await service.updateApp('surveys', {
        key: 'something-else',
      } as any);

      expect(updated.key).toBe('surveys');
    });

    it('rejects an unknown app rather than creating one', async () => {
      const appRepo = repoWith(null);
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      await expect(service.updateApp('ghost', { status: 'live' })).rejects.toThrow(
        /ghost/,
      );
    });

    it('rejects a status that is not a real one', async () => {
      const appRepo = repoWith(app('surveys', 'coming_soon'));
      const service = new MarketplaceService({} as any, appRepo as any, {} as any);

      await expect(
        service.updateApp('surveys', { status: 'launched' as any }),
      ).rejects.toThrow(/status/i);
    });
  });
});
