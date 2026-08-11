import { ReverseLookupService } from './reverse-lookup.service';

const makeRepo = (events: any[] = []) => ({
  create: jest.fn((x: any) => x),
  save: jest.fn(async (x: any) => ({ id: 1, ...x })),
  find: jest.fn().mockResolvedValue(events),
});

// Mirrors seedDefaultConfig's GOOGLE_PLACES_COST_USD bootstrap default
// (0.017), sourced from the shared SettingsReaderService instead of
// process.env.
const makeSettingsReader = (rate = 0.017) => ({
  getNumber: jest.fn().mockResolvedValue(rate),
});

describe('ReverseLookupService', () => {
  describe('record', () => {
    it('bills the flat per-request rate for a real (uncached) Google hit', async () => {
      const repo = makeRepo();
      await new ReverseLookupService(repo as any, makeSettingsReader() as any).record({
        phoneNumber: '+27115292888',
        result: { callerName: 'Discovery Bank' },
        cached: false,
      });
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toMatchObject({ phoneNumber: '+27115292888', provider: 'google', cached: false, hasName: true, success: true });
      expect(Number(saved.costUsd)).toBeCloseTo(0.017, 4);
    });

    it('records a cached hit at zero cost', async () => {
      const repo = makeRepo();
      await new ReverseLookupService(repo as any, makeSettingsReader() as any)
        .record({ phoneNumber: '+27821234567', result: { callerName: 'Kalahari' }, cached: true });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.cached).toBe(true);
      expect(Number(saved.costUsd)).toBe(0);
    });

    it('still bills an uncached call that found nothing (Google charges per request)', async () => {
      const repo = makeRepo();
      await new ReverseLookupService(repo as any, makeSettingsReader() as any)
        .record({ phoneNumber: '+27821234567', result: null, cached: false });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.success).toBe(false);
      expect(saved.hasName).toBe(false);
      expect(Number(saved.costUsd)).toBeCloseTo(0.017, 4);
    });

    // Regression: the per-lookup rate must reflect an admin-configured value,
    // not a hardcoded 0.017 literal.
    it('bills the admin-configured GOOGLE_PLACES_COST_USD rate, not a hardcoded literal', async () => {
      const repo = makeRepo();
      const settingsReader = makeSettingsReader(0.05);
      await new ReverseLookupService(repo as any, settingsReader as any).record({
        phoneNumber: '+27115292888', result: { callerName: 'Discovery Bank' }, cached: false,
      });
      const saved = repo.save.mock.calls[0][0];
      expect(Number(saved.costUsd)).toBeCloseTo(0.05, 4);
      expect(settingsReader.getNumber).toHaveBeenCalledWith('GOOGLE_PLACES_COST_USD');
    });

    // Regression: a missing/invalid rate setting must fail loudly, not
    // silently fall back to a hardcoded 0.017 — SettingsReaderService's own
    // no-fallback contract.
    it('propagates a loud failure when GOOGLE_PLACES_COST_USD is missing/invalid', async () => {
      const repo = makeRepo();
      const settingsReader = { getNumber: jest.fn().mockRejectedValue(new Error('Missing or invalid setting: GOOGLE_PLACES_COST_USD')) };
      await expect(
        new ReverseLookupService(repo as any, settingsReader as any)
          .record({ phoneNumber: '+27115292888', result: null, cached: false }),
      ).rejects.toThrow(/Missing or invalid setting/i);
    });
  });

  describe('getStats', () => {
    const events = [
      { cached: false, lineType: null, hasName: true, costUsd: '0.0170', createdAt: new Date() },
      { cached: false, lineType: null, hasName: false, costUsd: '0.0170', createdAt: new Date() },
      { cached: true, lineType: null, hasName: false, costUsd: '0.0000', createdAt: new Date() },
    ];

    it('aggregates totals, cost, cache-hit rate and a name-resolution breakdown', async () => {
      const s = await new ReverseLookupService(makeRepo(events) as any, makeSettingsReader() as any).getStats();
      expect(s.totalLookups).toBe(3);
      expect(s.billedLookups).toBe(2);
      expect(s.cachedLookups).toBe(1);
      expect(s.cacheHitRate).toBeCloseTo(1 / 3, 2);
      expect(s.totalCostUsd).toBeCloseTo(0.034, 4);
      expect(s.costThisMonthUsd).toBeCloseTo(0.034, 4);
      expect(s.avgCostPerBilledUsd).toBeCloseTo(0.017, 4);
      // 1 of the 3 events returned a name; the other 2 did not.
      expect(s.byResolution.find((b: any) => b.label === 'Name found')?.count).toBe(1);
      expect(s.byResolution.find((b: any) => b.label === 'No match')?.count).toBe(2);
      expect(Array.isArray(s.dailyTrend)).toBe(true);
    });

    it('is safe with no events', async () => {
      const s = await new ReverseLookupService(makeRepo([]) as any, makeSettingsReader() as any).getStats();
      expect(s.totalLookups).toBe(0);
      expect(s.cacheHitRate).toBe(0);
      expect(s.totalCostUsd).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('returns recent events newest-first, paginated', async () => {
      const repo = makeRepo([{ id: 2 }]);
      const h = await new ReverseLookupService(repo as any, makeSettingsReader() as any).getHistory(50, 0);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC' }, take: 50, skip: 0 }));
      expect(h).toEqual([{ id: 2 }]);
    });
  });
});
