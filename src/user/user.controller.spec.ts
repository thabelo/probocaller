import { UserController } from './user.controller';

// The caller-ID lookup (GET /user/:phoneNumber) tells the incoming-call UI whether
// this caller is permitted for the requesting user, so it can auto-reject a
// disallowed business call before it rings.
describe('UserController — findUser caller-ID lookup: permittedForYou', () => {
  const makeController = () => {
    const userService: any = { findOrCreatePlaceholder: jest.fn() };
    const businessService: any = { resolveCallerIdentity: jest.fn(), getProfileByUserId: jest.fn(), getOwnerWalletBalance: jest.fn().mockResolvedValue(null) };
    const transactionService: any = {};
    const dataBrokerService: any = {
      isBusinessCallerAllowed: jest.fn(),
      isFreeWhitelistedForBusiness: jest.fn().mockResolvedValue(false),
    };
    const lookupService: any = { resolveExternalName: jest.fn().mockResolvedValue(null) };
    const externalLookupLimiter: any = { tryAcquire: jest.fn().mockReturnValue(true) };
    const settingRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const settingsReader: any = { getNumber: jest.fn().mockResolvedValue(0.15) };
    const controller = new UserController(userService, businessService, transactionService, dataBrokerService, lookupService, externalLookupLimiter, settingRepo, settingsReader);
    return { controller, userService, businessService, dataBrokerService, lookupService, externalLookupLimiter, settingRepo, settingsReader };
  };

  // Requests from an app build that supports the non-cacheable external-name flag.
  const capableReq = { user: { userId: 5 }, headers: { 'x-supports-external-caller-name': '1' } } as any;

  const businessCallerUser = {
    id: 9, phoneNumber: '5091234567', email: '5091234567@probo.local',
    name: 'Unknown', isBusiness: false, isSpam: false, walletBalance: 100,
  };

  it('reports the caller as not-permitted when the recipient blocks it, gated on the caller business', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(false);

    const res: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);

    expect(res.isBusiness).toBe(true);
    expect(res.permittedForYou).toBe(false);
    expect(dataBrokerService.isBusinessCallerAllowed).toHaveBeenCalledWith(5, 3);
  });

  // Free-call whitelist: the incoming-call UI must be able to tell the user the
  // business is NOT billed for this call (no earnings), so the lookup reports
  // whether the caller is currently free-whitelisted for the requesting user.
  // Keyed on the RESOLVED business id — grants live per business, and a last-10
  // caller-ID lookup resolves to a placeholder user, never the owner.
  it('flags freeCall when the business caller is free-whitelisted for the recipient', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);
    dataBrokerService.isFreeWhitelistedForBusiness.mockResolvedValue(true);

    const res: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);

    expect(res.freeCall).toBe(true);
    // Keyed on the recipient and the resolved business id.
    expect(dataBrokerService.isFreeWhitelistedForBusiness).toHaveBeenCalledWith(5, 3);
  });

  it('reports freeCall false for a business caller without a grant, and never consults the whitelist for a personal caller', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);

    const biz: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);
    expect(biz.freeCall).toBe(false);

    // Personal caller → no whitelist consultation at all.
    dataBrokerService.isFreeWhitelistedForBusiness.mockClear();
    userService.findOrCreatePlaceholder.mockResolvedValue({ ...businessCallerUser, phoneNumber: '5551112222' });
    businessService.resolveCallerIdentity.mockResolvedValue(null);
    const personal: any = await controller.findUser('5551112222', { user: { userId: 5 } } as any);
    expect(personal.freeCall).toBe(false);
    expect(dataBrokerService.isFreeWhitelistedForBusiness).not.toHaveBeenCalled();
  });

  // The ringing UI shows the caller's live per-second rate (mockup: "R 0.15/s").
  // That number lives in the RATE_PER_SECOND setting — the same source billing
  // uses — so the lookup must carry it rather than the app guessing a constant.
  it('includes the platform ratePerSecond for a business caller', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);

    const res: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);

    expect(res.ratePerSecond).toBe(0.15);
  });

  it('uses the LIVE RATE_PER_SECOND from the settings reader, and omits it for personal callers', async () => {
    const { controller, userService, businessService, dataBrokerService, settingsReader } = makeController();
    settingsReader.getNumber.mockResolvedValue(0.2); // a non-default live rate
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);

    const biz: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);
    expect(biz.ratePerSecond).toBe(0.2); // reflects the live setting, not a hardcoded literal
    expect(settingsReader.getNumber).toHaveBeenCalledWith('RATE_PER_SECOND');

    userService.findOrCreatePlaceholder.mockResolvedValue({ ...businessCallerUser, phoneNumber: '5551112222' });
    businessService.resolveCallerIdentity.mockResolvedValue(null);
    const personal: any = await controller.findUser('5551112222', { user: { userId: 5 } } as any);
    expect(personal.ratePerSecond).toBeNull(); // meaningless for personal callers
  });

  // The funds flag must inspect the wallet billing ACTUALLY debits — the business
  // owner's user wallet — not the placeholder user auto-created for the raw
  // calling number (balance always 0). Otherwise every paid ring from a
  // registered business number is wrongly auto-rejected as "low funds".
  it('funds-checks the business OWNER wallet for a number-resolved business caller', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    // Placeholder user for the raw number: empty wallet.
    userService.findOrCreatePlaceholder.mockResolvedValue({ ...businessCallerUser, isBusiness: false, walletBalance: 0 });
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 4,
      businessProfile: { companyName: 'MTN HO', industry: 'Telecoms', verified: true },
    });
    businessService.getOwnerWalletBalance.mockResolvedValue(0.3268); // owner can fund ≥1s
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);

    const funded: any = await controller.findUser('7831119999', { user: { userId: 5 } } as any);
    expect(funded.hasSufficientFunds).toBe(true);
    expect(businessService.getOwnerWalletBalance).toHaveBeenCalledWith(4);

    // Owner truly broke → correctly flagged insufficient.
    businessService.getOwnerWalletBalance.mockResolvedValue(0);
    const broke: any = await controller.findUser('7831119999', { user: { userId: 5 } } as any);
    expect(broke.hasSufficientFunds).toBe(false);
  });

  // An empty-wallet business is normally auto-rejected ("load funds") — but a
  // free-whitelisted call bills nothing, so it must not be blocked for funds.
  it('reports sufficient funds for a free-whitelisted business even with an empty wallet', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue({ ...businessCallerUser, walletBalance: 0 });
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    dataBrokerService.isBusinessCallerAllowed.mockResolvedValue(true);
    dataBrokerService.isFreeWhitelistedForBusiness.mockResolvedValue(true);

    const res: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);

    expect(res.freeCall).toBe(true);
    expect(res.hasSufficientFunds).toBe(true);
  });

  it('reports permitted for a non-business caller without consulting permissions', async () => {
    const { controller, userService, businessService, dataBrokerService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue({ ...businessCallerUser, phoneNumber: '5551112222' });
    businessService.resolveCallerIdentity.mockResolvedValue(null);

    const res: any = await controller.findUser('5551112222', { user: { userId: 5 } } as any);

    expect(res.permittedForYou).toBe(true);
    expect(dataBrokerService.isBusinessCallerAllowed).not.toHaveBeenCalled();
  });

  // For an unknown number (not registered, no business), fall back to the external
  // provider so the app shows a business name instead of "Unknown". The name is
  // external data — flag it non-cacheable so the app never persists it (ToS).
  it('enriches an unknown caller with an external business name, marked non-cacheable', async () => {
    const { controller, userService, businessService, lookupService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue({
      id: 12, phoneNumber: '+27115292888', email: '+27115292888@probo.local',
      name: 'Unknown', isBusiness: false, isSpam: false, walletBalance: 0,
    });
    businessService.resolveCallerIdentity.mockResolvedValue(null);
    businessService.getProfileByUserId.mockResolvedValue(null);
    lookupService.resolveExternalName.mockResolvedValue('Discovery Health Franchise Office');

    const res: any = await controller.findUser('+27115292888', capableReq);

    expect(res.name).toBe('Discovery Health Franchise Office');
    expect(res.externalName).toBe(true);
    expect(res.cacheable).toBe(false);
    expect(res.isRegistered).toBe(false);
    expect(lookupService.resolveExternalName).toHaveBeenCalledWith('+27115292888');
  });

  const unknownPlaceholder = {
    id: 12, phoneNumber: '+27115292888', email: '+27115292888@probo.local',
    name: 'Unknown', isBusiness: false, isSpam: false, walletBalance: 0,
  };

  // Guard 1: an older app build that doesn't advertise support must NOT receive an
  // external name — it can't honor cacheable:false, so it would wrongly persist it.
  it('does not enrich an unknown caller when the client does not advertise support', async () => {
    const { controller, userService, businessService, lookupService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(unknownPlaceholder);
    businessService.resolveCallerIdentity.mockResolvedValue(null);
    businessService.getProfileByUserId.mockResolvedValue(null);
    lookupService.resolveExternalName.mockResolvedValue('Discovery Health Franchise Office');

    const res: any = await controller.findUser('+27115292888', { user: { userId: 5 } } as any);

    expect(res.name).toBe('Unknown');
    expect(res.externalName).toBe(false);
    expect(lookupService.resolveExternalName).not.toHaveBeenCalled();
  });

  // Guard 2: over the per-user rate limit, skip the billable external lookup.
  it('does not enrich when the per-user external-lookup rate limit is exceeded', async () => {
    const { controller, userService, businessService, lookupService, externalLookupLimiter } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(unknownPlaceholder);
    businessService.resolveCallerIdentity.mockResolvedValue(null);
    businessService.getProfileByUserId.mockResolvedValue(null);
    externalLookupLimiter.tryAcquire.mockReturnValue(false);
    lookupService.resolveExternalName.mockResolvedValue('Discovery Health Franchise Office');

    const res: any = await controller.findUser('+27115292888', capableReq);

    expect(res.name).toBe('Unknown');
    expect(res.externalName).toBe(false);
    expect(lookupService.resolveExternalName).not.toHaveBeenCalled();
  });

  it('does not query the external provider for a registered/business caller', async () => {
    const { controller, userService, businessService, lookupService } = makeController();
    userService.findOrCreatePlaceholder.mockResolvedValue(businessCallerUser);
    businessService.resolveCallerIdentity.mockResolvedValue({
      isBusiness: true, businessId: 3,
      businessProfile: { companyName: 'Kalahari', industry: 'Finance', verified: true },
    });
    businessService.getProfileByUserId.mockResolvedValue(null);

    const res: any = await controller.findUser('5091234567', { user: { userId: 5 } } as any);

    expect(res.name).toBe('Kalahari');
    expect(res.cacheable).not.toBe(false);
    expect(lookupService.resolveExternalName).not.toHaveBeenCalled();
  });
});

// The Wallet screen's "How You Earn" projection must reflect the ADMIN-set rate,
// not a hardcoded client constant. GET /user/rate exposes the live platform rate
// and split to any authenticated user for that purpose.
describe('UserController — GET /user/rate (live platform rate for the app)', () => {
  // settingVal supplies raw numbers for the SettingsReaderService-backed rates
  // (RATE_PER_SECOND, PLATFORM_CUT_RATE, SMS_RATE_PER_MESSAGE,
  // PAY_TO_CONTACT_FEE_RATE) — these mirror seedDefaultConfig's bootstrap
  // defaults purely as TEST-FIXTURE convenience; the app itself no longer has
  // a fallback and would throw if a row were genuinely missing (seeding
  // guarantees it isn't). REFERRAL_COMMISSION_RATE is still read directly off
  // the Setting repository (unchanged, not part of this dedup).
  const make = (settingVal: any) => {
    const settingRepo: any = {
      findOne: jest.fn().mockImplementation(async (opts: any) => {
        if (opts.where.key === 'REFERRAL_COMMISSION_RATE') return settingVal.referral ?? null;
        return null;
      }),
    };
    const settingsReader: any = {
      getNumber: jest.fn().mockImplementation(async (key: string) => {
        if (key === 'RATE_PER_SECOND') return settingVal.rate ?? 0.002;
        if (key === 'PLATFORM_CUT_RATE') return settingVal.cut ?? 0.24;
        if (key === 'SMS_RATE_PER_MESSAGE') return settingVal.smsRate ?? 0.05;
        if (key === 'PAY_TO_CONTACT_FEE_RATE') return settingVal.payToContactFeeRate ?? 0.3;
        throw new Error(`unexpected setting key in test: ${key}`);
      }),
    };
    return new UserController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, settingRepo, settingsReader);
  };

  it('returns the live rate, platform cut and derived user share', async () => {
    const c = make({ rate: 0.15, cut: 0.24 });
    const res: any = await c.getRate();
    expect(res.ratePerSecond).toBe(0.15);
    expect(res.platformCutRate).toBe(0.24);
    expect(res.userShare).toBeCloseTo(0.76, 6); // 1 - cut
  });

  // Regression: these must come from the shared SettingsReaderService, not a
  // hardcoded literal baked back into the controller.
  it('reads ratePerSecond and platformCutRate from the settings reader, not a hardcoded literal', async () => {
    const c = make({ rate: 0.2, cut: 0.5 });
    const res: any = await c.getRate();
    expect(res.ratePerSecond).toBe(0.2);
    expect(res.platformCutRate).toBe(0.5);
    expect(res.userShare).toBeCloseTo(0.5, 6);
  });

  /**
   * The referral share is quoted to users ("earn 3% of everything they make"),
   * so the app has to be able to read the configured figure. Without it the
   * copy is a guess that silently goes stale the moment an admin changes it.
   */
  it('exposes the admin-configured referral commission rate', async () => {
    const c = make({ referral: { value: '0.05' } });
    const res: any = await c.getRate();
    expect(res.referralCommissionRate).toBe(0.05);
  });

  it('falls back to the default referral rate when unset', async () => {
    const c = make({});
    const res: any = await c.getRate();
    expect(res.referralCommissionRate).toBe(0.03);
  });

  /**
   * Pay-to-Contact earnings estimate (client-side, pre-ring) must track the
   * SAME admin-configurable rate the server actually settles with
   * (PAY_TO_CONTACT_FEE_RATE, now a Setting row, not process.env), or the
   * estimate silently drifts from what the user is actually paid the moment
   * an admin changes it.
   */
  describe('payToContactFeeRate', () => {
    it('exposes the admin-configured PAY_TO_CONTACT_FEE_RATE', async () => {
      const c = make({ payToContactFeeRate: 0.35 });
      const res: any = await c.getRate();
      expect(res.payToContactFeeRate).toBe(0.35);
    });
  });

  /**
   * The SMS composer's per-message cost estimate must reflect the ADMIN-set
   * SMS_RATE_PER_MESSAGE setting (billing's real source), not a hardcoded
   * client constant that can silently drift the moment an admin changes it.
   */
  describe('smsRatePerMessage', () => {
    it('exposes the admin-configured SMS_RATE_PER_MESSAGE', async () => {
      const c = make({ smsRate: 0.08 });
      const res: any = await c.getRate();
      expect(res.smsRatePerMessage).toBe(0.08);
    });
  });
});

// Free, explicit opt-in: the client calls this after the business onboarding.
describe('UserController — POST /user/business-opt-in', () => {
  it('delegates to the service for the authenticated user only', async () => {
    const userService: any = { enableBusinessMode: jest.fn().mockResolvedValue({ businessOptIn: true }) };
    const controller = new UserController(
      userService, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const res: any = await controller.enableBusinessMode({ user: { userId: 42 } } as any);

    expect(res.businessOptIn).toBe(true);
    // Keyed on the JWT subject — a caller can never opt someone else in.
    expect(userService.enableBusinessMode).toHaveBeenCalledWith(42);
  });
});

describe('UserController — POST /user/business-opt-out', () => {
  it('delegates to the service for the authenticated user only', async () => {
    const userService: any = { disableBusinessMode: jest.fn().mockResolvedValue({ businessOptIn: false }) };
    const controller = new UserController(
      userService, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const res: any = await controller.disableBusinessMode({ user: { userId: 42 } } as any);

    expect(res.businessOptIn).toBe(false);
    // Keyed on the JWT subject — a caller can never opt someone else out.
    expect(userService.disableBusinessMode).toHaveBeenCalledWith(42);
  });
});

/**
 * Caller-ID is on the incoming-call hot path — the ringing overlay shows
 * "Looking up caller…" until this endpoint answers, so every avoidable round
 * trip is visible delay. The platform rate, the user row and the business
 * identity depend on nothing but the phone number, so they must be fetched
 * concurrently rather than one after another.
 */
describe('UserController — findUser latency', () => {
  it('fetches the rate, the user and the caller identity concurrently', async () => {
    const started: string[] = [];
    let resolveAll: () => void = () => {};
    const gate = new Promise<void>((res) => { resolveAll = res; });

    // Each dependency records that it started, then waits on a shared gate.
    // Sequential code deadlocks here; concurrent code reaches all three.
    const track = <T>(name: string, value: T) => jest.fn(async () => {
      started.push(name);
      if (started.length === 3) resolveAll();
      await gate;
      return value;
    });

    const userService: any = {
      findOrCreatePlaceholder: track('user', {
        id: 9, phoneNumber: '5091234567', name: 'Unknown',
        isBusiness: false, isSpam: false, walletBalance: 100,
      }),
    };
    const businessService: any = {
      resolveCallerIdentity: track('identity', null),
      getProfileByUserId: jest.fn().mockResolvedValue(null),
      getOwnerWalletBalance: jest.fn().mockResolvedValue(null),
    };
    const dataBrokerService: any = {
      isBusinessCallerAllowed: jest.fn().mockResolvedValue(true),
      isFreeWhitelistedForBusiness: jest.fn().mockResolvedValue(false),
    };
    const lookupService: any = { resolveExternalName: jest.fn().mockResolvedValue(null) };
    const externalLookupLimiter: any = { tryAcquire: jest.fn().mockReturnValue(true) };
    const settingsReader: any = { getNumber: track('rate', 0.15) };

    const controller = new UserController(
      userService, businessService, {} as any, dataBrokerService,
      lookupService, externalLookupLimiter, {} as any, settingsReader,
    );

    const result = await Promise.race([
      controller.findUser('5091234567', { user: { userId: 5 }, headers: {} } as any).then(() => 'done'),
      new Promise((res) => setTimeout(() => res('timeout'), 2000)),
    ]);

    expect(started.sort()).toEqual(['identity', 'rate', 'user']);
    expect(result).toBe('done');
  });
});
