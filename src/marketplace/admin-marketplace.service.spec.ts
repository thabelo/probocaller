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
