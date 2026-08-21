import { ProfileController } from './profile.controller';

describe('ProfileController — admin data profile routes', () => {
  const service = {
    adminGetUserDataProfile: jest.fn().mockResolvedValue({ ok: true }),
    adminUpdateUserDataBroker: jest.fn().mockResolvedValue({ ok: true }),
  } as any;
  const history = {
    forUser: jest.fn().mockResolvedValue({ userId: 7, changes: [] }),
    topMovers: jest.fn().mockResolvedValue({ users: [] }),
    changeStats: jest.fn().mockResolvedValue({ perDay: [], byField: [], byKind: [], totalChanges: 0, activeUsers: 0 }),
  } as any;
  const nudges = { listStale: jest.fn().mockResolvedValue({ staleAfterDays: 90, users: [] }) } as any;
  const controller = new ProfileController(service, history, nudges);

  it('GET admin/user/:userId delegates to the service with a numeric id', async () => {
    await controller.adminGetUserDataProfile('7');
    expect(service.adminGetUserDataProfile).toHaveBeenCalledWith(7);
  });

  it('PATCH admin/user/:userId forwards the id and body to the service', async () => {
    await controller.adminUpdateUserDataBroker('7', { dataShareEnabled: false });
    expect(service.adminUpdateUserDataBroker).toHaveBeenCalledWith(7, { dataShareEnabled: false });
  });

  it("GET admin/user/:userId/history reads that user's history", async () => {
    await controller.adminUserHistory('7');
    expect(history.forUser).toHaveBeenCalledWith(7);
  });

  /**
   * The id comes from the token, never the request — otherwise "my history"
   * is a lookup of anybody's.
   */
  it('GET me/history reads only the caller’s own history', async () => {
    await controller.myHistory({ user: { userId: 42 } });
    expect(history.forUser).toHaveBeenCalledWith(42);
  });

  it('GET admin/change-report defaults to the last week', async () => {
    await controller.adminChangeReport();
    const [{ from, to }] = history.topMovers.mock.calls.at(-1)!;
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('GET admin/change-report caps how much it will return', async () => {
    await controller.adminChangeReport('week', undefined, undefined, '10000');
    expect(history.topMovers.mock.calls.at(-1)![0].limit).toBe(100);
  });

  it('GET admin/stale lists the profiles that have gone quiet', async () => {
    await expect(controller.adminStaleProfiles()).resolves.toMatchObject({ staleAfterDays: 90 });
  });

  it('GET admin/change-stats aggregates over the default week', async () => {
    await controller.adminChangeStats();
    const [{ from, to }] = history.changeStats.mock.calls.at(-1)!;
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
