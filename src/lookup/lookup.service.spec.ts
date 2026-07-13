import { LookupService } from './lookup.service';

/**
 * Regression: community spam reports must count even when the number is NOT a
 * registered Probo user. Unknown numbers are exactly the ones most likely to be
 * scam callers, and Scam Shield relies on this count. The old not-found branch
 * hard-coded userReports: 0, hiding crowd reports about unregistered spammers.
 */
describe('LookupService — community reports on unregistered numbers', () => {
  function makeService(reportCount: number) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(null), // number isn't a registered user
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(reportCount),
      })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn() };
    const suppression: any = { isSuppressed: jest.fn().mockResolvedValue(false) };
    return new LookupService(userRepo, businessService, suppression);
  }

  it('counts community spam reports for an unregistered number', async () => {
    const res = await makeService(2).lookup('+27820000001');
    expect(res.found).toBe(false);
    expect(res.flags.userReports).toBe(2);
  });

  it('marks an unregistered number blocked once it crosses the threshold', async () => {
    const res = await makeService(3).lookup('+27820000001');
    expect(res.flags.blocked).toBe(true);
  });

  it('exposes no badge for an unregistered number', async () => {
    const res = await makeService(0).lookup('+27820000001');
    expect(res.badge).toBeNull();
  });
});

describe('LookupService — premium badge', () => {
  function makeServiceForUser(tier: string, suppressed = false) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 5, phoneNumber: '+27820000005', isSpam: false, tier,
      }),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn().mockResolvedValue(null) };
    const suppression: any = { isSuppressed: jest.fn().mockResolvedValue(suppressed) };
    return new LookupService(userRepo, businessService, suppression);
  }

  it('exposes the gold badge for a registered gold user', async () => {
    const res = await makeServiceForUser('gold').lookup('+27820000005');
    expect(res.found).toBe(true);
    expect(res.badge).toBe('gold');
  });

  it('exposes no badge for a free user', async () => {
    const res = await makeServiceForUser('free').lookup('+27820000005');
    expect(res.badge).toBeNull();
  });

  // POPIA/GDPR opt-out: a suppressed number reveals nothing, even if registered.
  it('reveals nothing for a suppressed number, even if registered', async () => {
    const res = await makeServiceForUser('gold', true).lookup('+27820000005');
    expect(res.found).toBe(false);
    expect(res.status).toBe('not_registered');
    expect(res.business).toBeNull();
    expect(res.badge).toBeNull();
    expect(res.flags.userReports).toBe(0);
    expect(res.flags.blocked).toBe(false);
  });
});

// Fallback: for numbers not in our own directory, enrich from an external
// number-intelligence provider (Google Places) so caller ID works before we have data.
describe('LookupService — external number-intelligence fallback', () => {
  function makeService(providerResult: any, opts: { suppressed?: boolean } = {}) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(null), // unregistered
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn() };
    const suppression: any = { isSuppressed: jest.fn().mockResolvedValue(!!opts.suppressed) };
    const provider: any = { lookup: jest.fn().mockResolvedValue(providerResult) };
    const reverseLookup: any = { record: jest.fn().mockResolvedValue(undefined) };
    return {
      svc: new LookupService(userRepo, businessService, suppression, provider, reverseLookup),
      provider,
      reverseLookup,
    };
  }

  it('enriches an unregistered number with carrier / line type / name', async () => {
    const { svc, provider } = makeService({ callerName: 'Acme', carrierName: 'MTN', lineType: 'mobile' });
    const res = await svc.lookup('+27820000009');
    expect(res.found).toBe(false);
    expect(res.external).toEqual({ callerName: 'Acme', carrierName: 'MTN', lineType: 'mobile' });
    expect(provider.lookup).toHaveBeenCalledWith('+27820000009');
  });

  // The external provider needs a country code (Google resolves E.164 only), so a
  // ZA-local number (0XXXXXXXXX) must be converted to +27 before we query it —
  // otherwise national-format lookups never enrich.
  it('queries the external provider in E.164 for a ZA national number', async () => {
    const { svc, provider, reverseLookup } = makeService({ callerName: 'Discovery' });
    await svc.lookup('0115292888');
    expect(provider.lookup).toHaveBeenCalledWith('+27115292888');
    expect(reverseLookup.record).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '+27115292888' }),
    );
  });

  it('leaves external null when the provider has nothing', async () => {
    const { svc } = makeService(null);
    const res = await svc.lookup('+27820000009');
    expect(res.external).toBeNull();
  });

  it('records the reverse-lookup for billing when the provider is used', async () => {
    const { svc, reverseLookup } = makeService({ lineType: 'mobile' });
    await svc.lookup('+27820000009');
    expect(reverseLookup.record).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '+27820000009', result: { lineType: 'mobile' } }),
    );
  });

  it('does not record billing for a suppressed number', async () => {
    const { svc, reverseLookup } = makeService({ lineType: 'mobile' }, { suppressed: true });
    await svc.lookup('+27820000009');
    expect(reverseLookup.record).not.toHaveBeenCalled();
  });

  it('never queries the external provider for a suppressed number (POPIA)', async () => {
    const { svc, provider } = makeService({ carrierName: 'MTN' }, { suppressed: true });
    const res = await svc.lookup('+27820000009');
    expect(res.external).toBeNull();
    expect(provider.lookup).not.toHaveBeenCalled();
  });

  it('works with no provider configured (external null)', async () => {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), getCount: jest.fn().mockResolvedValue(0) })),
    };
    const svc = new LookupService(userRepo, { resolveCallerIdentity: jest.fn() } as any, { isSuppressed: jest.fn().mockResolvedValue(false) } as any);
    const res = await svc.lookup('+27820000009');
    expect(res.external).toBeNull();
  });
});

// resolveExternalName is the lean caller-ID path the mobile app uses (via
// user.controller): resolve a public business name for an unknown number, honoring
// suppression (POPIA) and recording the billable lookup, without the full public
// lookup payload.
describe('LookupService — resolveExternalName (app caller-ID)', () => {
  function make(providerResult: any, opts: { suppressed?: boolean } = {}) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), getCount: jest.fn().mockResolvedValue(0) })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn() };
    const suppression: any = { isSuppressed: jest.fn().mockResolvedValue(!!opts.suppressed) };
    const provider: any = { lookup: jest.fn().mockResolvedValue(providerResult) };
    const reverseLookup: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { svc: new LookupService(userRepo, businessService, suppression, provider, reverseLookup), provider, reverseLookup };
  }

  it('returns the external business name for an unknown ZA number (E.164) and records billing', async () => {
    const { svc, provider, reverseLookup } = make({ callerName: 'Discovery Bank' });
    const name = await svc.resolveExternalName('0115292888');
    expect(name).toBe('Discovery Bank');
    expect(provider.lookup).toHaveBeenCalledWith('+27115292888');
    expect(reverseLookup.record).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: '+27115292888' }));
  });

  it('returns null and never queries the provider for a suppressed number (POPIA)', async () => {
    const { svc, provider } = make({ callerName: 'X' }, { suppressed: true });
    expect(await svc.resolveExternalName('+27115292888')).toBeNull();
    expect(provider.lookup).not.toHaveBeenCalled();
  });

  it('returns null when the provider has no name', async () => {
    const { svc } = make(null);
    expect(await svc.resolveExternalName('+27115292888')).toBeNull();
  });
});

// Placeholder rows (auto-created by caller-ID lookups: name 'Unknown' + a
// @probo.local email) are NOT real registrations. They must read as unregistered
// so the external fallback runs — otherwise a looked-up unknown number reads as
// "Registered · In Good Standing" and never enriches.
describe('LookupService — placeholder rows are not registered', () => {
  function makeService(user: any, providerResult: any, businessIdentity: any = null) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(user),
      createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), getCount: jest.fn().mockResolvedValue(0) })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn().mockResolvedValue(businessIdentity) };
    const suppression: any = { isSuppressed: jest.fn().mockResolvedValue(false) };
    const provider: any = { lookup: jest.fn().mockResolvedValue(providerResult) };
    const reverseLookup: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { svc: new LookupService(userRepo, businessService, suppression, provider, reverseLookup), provider };
  }

  const placeholder = { id: 163, name: 'Unknown', email: '0722250760@probo.local', phoneNumber: '+27722250760', isBusiness: false };

  it('treats a placeholder (no business) as not registered and runs the external fallback', async () => {
    const { svc, provider } = makeService(placeholder, { carrierName: 'Vodacom', lineType: 'mobile' });
    const res = await svc.lookup('+27722250760');
    expect(res.found).toBe(false);
    expect(res.status).toBe('not_registered');
    expect(res.external).toEqual({ carrierName: 'Vodacom', lineType: 'mobile' });
    expect(provider.lookup).toHaveBeenCalled();
  });

  it('keeps a REAL registered user registered — no fallback', async () => {
    const real = { id: 47, name: 'Thabo Mokoena', email: 'thabo@example.com', phoneNumber: '+27811234567', isBusiness: false, isSpam: false, tier: 'free' };
    const { svc, provider } = makeService(real, { carrierName: 'X' });
    const res = await svc.lookup('+27811234567');
    expect(res.found).toBe(true);
    expect(res.external).toBeNull();
    expect(provider.lookup).not.toHaveBeenCalled();
  });

  it('still shows a business even when the number only has a placeholder user row', async () => {
    const biz = { isBusiness: true, businessId: 9, businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true } };
    const { svc, provider } = makeService(placeholder, { carrierName: 'X' }, biz);
    const res = await svc.lookup('+27722250760');
    expect(res.found).toBe(true);
    expect(res.status).toBe('verified_business');
    expect(res.business?.name).toBe('Kalahari');
    expect(provider.lookup).not.toHaveBeenCalled();
  });
});
