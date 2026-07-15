import { FxService } from './fx.service';

describe('FxService — live FX rates (base ZAR)', () => {
  let service: FxService;
  const okPayload = {
    result: 'success',
    base_code: 'ZAR',
    rates: { ZAR: 1, USD: 0.054, GBP: 0.043, NAD: 1 },
  };

  beforeEach(() => {
    service = new FxService();
    jest.restoreAllMocks();
  });

  it('fetches live ZAR-based rates and marks them live', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => okPayload,
    } as any);

    const res = await service.getRates();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.base).toBe('ZAR');
    expect(res.rates.USD).toBe(0.054);
    expect(res.rates.ZAR).toBe(1);
    expect(res.source).toBe('live');
    expect(typeof res.updatedAt).toBe('string');
  });

  it('caches within the TTL — a second call does not refetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => okPayload,
    } as any);

    await service.getRates();
    await service.getRates();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a static ZAR-based table when the live feed fails', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));

    const res = await service.getRates();
    expect(res.source).toBe('fallback');
    expect(res.base).toBe('ZAR');
    expect(res.rates.ZAR).toBe(1);
    expect(res.rates.NAD).toBe(1); // NAD is pegged to ZAR
    expect(res.rates.USD).toBeGreaterThan(0);
  });

  it('falls back when the payload is malformed (no rates / not success)', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, json: async () => ({ result: 'error' }),
    } as any);

    const res = await service.getRates();
    expect(res.source).toBe('fallback');
    expect(res.rates.ZAR).toBe(1);
  });
});
