import { FxService } from './fx.service';

const mockRepo = () => ({ findOne: jest.fn(), create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) });

describe('FxService — live FX rates (base ZAR)', () => {
  let service: FxService;
  let settingRepo: ReturnType<typeof mockRepo>;
  const okPayload = {
    result: 'success',
    base_code: 'ZAR',
    rates: { ZAR: 1, USD: 0.054, GBP: 0.043, NAD: 1 },
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    settingRepo = mockRepo();
    settingRepo.findOne.mockResolvedValue(null);
    service = new FxService(settingRepo as any);
  });

  it('fetches live ZAR-based rates and marks them live', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => okPayload,
    } as any);

    const res = await service.getRates();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.base).toBe('ZAR');
    expect(res.rates.USD).toBe(0.054);
    expect(res.source).toBe('live');
    expect(typeof res.updatedAt).toBe('string');
  });

  it('persists the last-good live rates for future cold starts', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => okPayload } as any);
    await service.getRates();
    expect(settingRepo.save).toHaveBeenCalled();
    const saved = settingRepo.save.mock.calls[0][0];
    expect(saved.key).toBe('FX_RATES_CACHE');
    expect(JSON.parse(saved.value).rates.USD).toBe(0.054);
  });

  it('caches within the TTL — a second call does not refetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => okPayload,
    } as any);
    await service.getRates();
    await service.getRates();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the last-good PERSISTED rates when the live feed fails (not the stale static table)', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));
    settingRepo.findOne.mockResolvedValue({
      key: 'FX_RATES_CACHE',
      value: JSON.stringify({ rates: { ZAR: 1, USD: 0.061, GBP: 0.045 }, updatedAt: 'yesterday' }),
    });

    const res = await service.getRates();
    expect(res.source).toBe('cached');
    expect(res.rates.USD).toBe(0.061); // the persisted live value, not the static ~0.054
  });

  it('falls back to the static ZAR-based table when the feed fails AND nothing is persisted', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));
    settingRepo.findOne.mockResolvedValue(null);

    const res = await service.getRates();
    expect(res.source).toBe('fallback');
    expect(res.rates.ZAR).toBe(1);
    expect(res.rates.NAD).toBe(1); // NAD is pegged to ZAR
    expect(res.rates.USD).toBeGreaterThan(0);
  });

  it('falls back when the payload is malformed (no rates / not success)', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => ({ result: 'error' }),
    } as any);
    settingRepo.findOne.mockResolvedValue(null);

    const res = await service.getRates();
    expect(res.source).toBe('fallback');
    expect(res.rates.ZAR).toBe(1);
  });
});
