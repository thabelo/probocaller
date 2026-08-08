import { GooglePlacesLookupService } from './google-places-lookup.service';

describe('GooglePlacesLookupService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    (global as any).fetch = jest.fn();
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('is disabled (returns null, no network) when no API key is configured', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await new GooglePlacesLookupService().lookup('+27115292888');
    expect(res).toBeNull();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('resolves a business name from a phone number', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        candidates: [{ name: 'Discovery Bank', business_status: 'OPERATIONAL' }],
      }),
    });
    const res = await new GooglePlacesLookupService().lookup('+27115292888');
    expect(res).toEqual({ callerName: 'Discovery Bank' });
    const calledUrl = (global as any).fetch.mock.calls[0][0];
    expect(calledUrl).toContain('findplacefromtext');
    expect(calledUrl).toContain('inputtype=phonenumber');
  });

  // Google Places listings are publicly editable and a closed/defunct listing's
  // name field is unvetted (it may be stale or vandalized) — the field is
  // already requested via `fields=name,business_status` but was never read, so
  // a closed business's raw name was shown as a live caller's identity anyway.
  it('does not surface a name for a permanently closed listing', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        candidates: [{ name: 'This businesses is Closed', business_status: 'CLOSED_PERMANENTLY' }],
      }),
    });
    const res = await new GooglePlacesLookupService().lookup('+27820000000');
    expect(res).toBeNull();
  });

  it('does not surface a name for a temporarily closed listing', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        candidates: [{ name: 'Some Cafe', business_status: 'CLOSED_TEMPORARILY' }],
      }),
    });
    const res = await new GooglePlacesLookupService().lookup('+27115292888');
    expect(res).toBeNull();
  });

  it('returns null when Google finds no candidates', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS', candidates: [] }),
    });
    const res = await new GooglePlacesLookupService().lookup('+27000000000');
    expect(res).toBeNull();
  });

  it('fails safe (null) on a non-OK HTTP response', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await new GooglePlacesLookupService().lookup('+27115292888');
    expect(res).toBeNull();
  });

  it('fails safe (null) when the request throws', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
    const res = await new GooglePlacesLookupService().lookup('+27115292888');
    expect(res).toBeNull();
  });
});
