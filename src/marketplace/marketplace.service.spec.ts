import { IsNull } from 'typeorm';
import { MarketplaceService } from './marketplace.service';

/**
 * Marketplace — per-app state resolution (Cycle 1).
 *
 * `appState` is the single source of truth for what a user may do with an app:
 * the storefront card, the App Detail action and the access guard all read from
 * it, so a locked app cannot be opened by a client that simply ignores the UI.
 */
describe('MarketplaceService.appState', () => {
  const service = new MarketplaceService({} as any, {} as any);

  const liveUserApp = {
    key: 'data-broker',
    audience: 'user' as const,
    status: 'live' as const,
    requiresKyb: false,
  };

  // Audience & Leads: business-only, and gated on KYB verification because it
  // exposes other users' profile data.
  const liveBusinessApp = {
    key: 'audience-leads',
    audience: 'business' as const,
    status: 'live' as const,
    requiresKyb: true,
  };

  const personalUser = { hasBusinessAccess: false, kybVerified: false };
  const unverifiedBusiness = { hasBusinessAccess: true, kybVerified: false };
  const verifiedBusiness = { hasBusinessAccess: true, kybVerified: true };

  it('live end-user app, not installed, personal account: available', () => {
    expect(service.appState(liveUserApp, personalUser, false)).toBe('available');
  });

  it('same app once installed: installed', () => {
    expect(service.appState(liveUserApp, personalUser, true)).toBe('installed');
  });

  it('business app on a personal account: needs_business', () => {
    expect(service.appState(liveBusinessApp, personalUser, false)).toBe(
      'needs_business',
    );
  });

  it('business app, business account, KYB not yet verified: needs_verification', () => {
    expect(service.appState(liveBusinessApp, unverifiedBusiness, false)).toBe(
      'needs_verification',
    );
  });

  it('business app, verified business: available', () => {
    expect(service.appState(liveBusinessApp, verifiedBusiness, false)).toBe(
      'available',
    );
  });

  it('an unreleased app reads as coming_soon even for an eligible user', () => {
    const unreleased = { ...liveUserApp, key: 'surveys', status: 'coming_soon' as const };
    expect(service.appState(unreleased, personalUser, false)).toBe('coming_soon');
  });
});

/**
 * The access primitive the route guard consults. Deliberately derived from
 * `appState` rather than from the install row alone: an install is necessary
 * but not sufficient, so a business whose KYB lapses loses access to the app it
 * already installed instead of keeping it until someone notices.
 */
describe('MarketplaceService.canUseApp', () => {
  const service = new MarketplaceService({} as any, {} as any);

  const leads = {
    key: 'audience-leads',
    audience: 'business' as const,
    status: 'live' as const,
    requiresKyb: true,
  };

  it('installed and still eligible: allowed', () => {
    expect(
      service.canUseApp(leads, { hasBusinessAccess: true, kybVerified: true }, true),
    ).toBe(true);
  });

  it('installed but KYB has lapsed: denied', () => {
    expect(
      service.canUseApp(leads, { hasBusinessAccess: true, kybVerified: false }, true),
    ).toBe(false);
  });

  it('eligible but never installed: denied', () => {
    expect(
      service.canUseApp(leads, { hasBusinessAccess: true, kybVerified: true }, false),
    ).toBe(false);
  });
});

/**
 * Install lookup. Because uninstalling only sets `uninstalledAt`, the row
 * outlives the user's consent — so this must never answer "installed?" from the
 * row's existence alone, or a removed app keeps working.
 */
describe('MarketplaceService.hasApp', () => {
  const makeRepo = (row: unknown) => ({ findOne: jest.fn().mockResolvedValue(row) });

  it('false when the user has never installed the app', async () => {
    const service = new MarketplaceService(makeRepo(null) as any, {} as any);
    await expect(service.hasApp(7, 'data-broker')).resolves.toBe(false);
  });

  it('true when an active install exists', async () => {
    const service = new MarketplaceService(makeRepo({ id: 1 }) as any, {} as any);
    await expect(service.hasApp(7, 'data-broker')).resolves.toBe(true);
  });

  it('asks only for installs that have not been removed', async () => {
    const repo = makeRepo(null);
    await new MarketplaceService(repo as any, {} as any).hasApp(7, 'data-broker');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { userId: 7, appKey: 'data-broker', uninstalledAt: IsNull() },
    });
  });
});

/**
 * Install / uninstall.
 *
 * Uninstall revokes rather than deletes, so install has to cope with an
 * existing dormant row. Reactivating it (instead of inserting a second one) is
 * what makes the product's promise true: remove an app, install it again later,
 * and the settings you had are still there.
 */
describe('MarketplaceService install/uninstall', () => {
  const makeRepo = (existing: unknown) => ({
    findOne: jest.fn().mockResolvedValue(existing),
    create: jest.fn((row: unknown) => row),
    save: jest.fn(async (row: unknown) => row),
  });

  it('first install creates an active row for the user', async () => {
    const repo = makeRepo(null);
    await new MarketplaceService(repo as any, {} as any).install(7, 'data-broker');

    const saved = repo.save.mock.calls[0][0] as any;
    expect(saved.userId).toBe(7);
    expect(saved.appKey).toBe('data-broker');
    expect(saved.uninstalledAt).toBeNull();
  });

  it('reinstalling reactivates the old row and keeps its settings', async () => {
    const dormant = {
      id: 42,
      userId: 7,
      appKey: 'data-broker',
      uninstalledAt: new Date('2026-01-01'),
      settingsJson: { fields: ['income_range'] },
    };
    const repo = makeRepo(dormant);
    await new MarketplaceService(repo as any, {} as any).install(7, 'data-broker');

    const saved = repo.save.mock.calls[0][0] as any;
    expect(saved.id).toBe(42);
    expect(saved.uninstalledAt).toBeNull();
    expect(saved.settingsJson).toEqual({ fields: ['income_range'] });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('uninstalling stamps the row instead of deleting it', async () => {
    const active = { id: 42, userId: 7, appKey: 'data-broker', uninstalledAt: null };
    const repo = makeRepo(active);
    await new MarketplaceService(repo as any, {} as any).uninstall(7, 'data-broker');

    const saved = repo.save.mock.calls[0][0] as any;
    expect(saved.id).toBe(42);
    expect(saved.uninstalledAt).toBeInstanceOf(Date);
  });
});

/**
 * The check the route guard performs. It fails CLOSED: anything it cannot
 * positively confirm — an unknown key, a retired app, a lapsed KYB — is a
 * denial, because this runs on endpoints that expose other people's data.
 */
describe('MarketplaceService.canAccess', () => {
  const leadsRow = {
    key: 'audience-leads',
    audience: 'business',
    status: 'live',
    requiresKyb: true,
  };

  const make = (app: unknown, install: unknown) =>
    new MarketplaceService(
      { findOne: jest.fn().mockResolvedValue(install) } as any,
      { findOne: jest.fn().mockResolvedValue(app) } as any,
    );

  const verified = { hasBusinessAccess: true, kybVerified: true };

  it('denies an app key that is not in the catalogue', async () => {
    const service = make(null, { id: 1 });
    await expect(service.canAccess(7, 'no-such-app', verified)).resolves.toBe(false);
  });

  it('allows a verified business that has installed the app', async () => {
    const service = make(leadsRow, { id: 1 });
    await expect(service.canAccess(7, 'audience-leads', verified)).resolves.toBe(true);
  });

  it('denies once KYB lapses, even though the install row still exists', async () => {
    const service = make(leadsRow, { id: 1 });
    await expect(
      service.canAccess(7, 'audience-leads', { hasBusinessAccess: true, kybVerified: false }),
    ).resolves.toBe(false);
  });
});

/**
 * Storefront listing and guarded install.
 *
 * `listApps` annotates the catalogue with each app's state; sectioning is the
 * client's business, so product can move an app between "earn" and "for your
 * business" without a server change. Retired apps are dropped outright — they
 * are not "coming soon", they are gone.
 *
 * `installApp` re-derives eligibility instead of trusting the caller: the
 * storefront can be bypassed, so an install request for a locked app has to be
 * refused here rather than in the UI.
 */
describe('MarketplaceService listing and guarded install', () => {
  const catalogue = [
    { key: 'data-broker', audience: 'user', status: 'live', requiresKyb: false },
    { key: 'audience-leads', audience: 'business', status: 'live', requiresKyb: true },
    { key: 'surveys', audience: 'user', status: 'coming_soon', requiresKyb: false },
    { key: 'old-thing', audience: 'user', status: 'retired', requiresKyb: false },
  ];

  const makeService = (installedKeys: string[] = []) =>
    new MarketplaceService(
      {
        find: jest.fn().mockResolvedValue(
          installedKeys.map((appKey) => ({ appKey })),
        ),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((row: unknown) => row),
        save: jest.fn(async (row: unknown) => row),
      } as any,
      {
        find: jest.fn().mockResolvedValue(catalogue),
        findOne: jest.fn(async ({ where }: any) =>
          catalogue.find((a) => a.key === where.key) ?? null,
        ),
      } as any,
    );

  const personal = { hasBusinessAccess: false, kybVerified: false };

  it('annotates every listed app with the state for this user', async () => {
    const listed = await makeService(['data-broker']).listApps(7, personal);
    const byKey = Object.fromEntries(listed.map((a) => [a.key, a.state]));

    expect(byKey['data-broker']).toBe('installed');
    expect(byKey['audience-leads']).toBe('needs_business');
    expect(byKey['surveys']).toBe('coming_soon');
  });

  it('drops retired apps from the catalogue', async () => {
    const listed = await makeService().listApps(7, personal);
    expect(listed.map((a) => a.key)).not.toContain('old-thing');
  });

  it('refuses to install an app the user is not eligible for', async () => {
    await expect(
      makeService().installApp(7, 'audience-leads', personal),
    ).rejects.toThrow(/not available/i);
  });

  it('refuses to install an unreleased app', async () => {
    await expect(
      makeService().installApp(7, 'surveys', personal),
    ).rejects.toThrow(/not available/i);
  });

  it('installs an app the user is eligible for', async () => {
    await expect(
      makeService().installApp(7, 'data-broker', personal),
    ).resolves.toBeDefined();
  });
});
