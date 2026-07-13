import { UserController } from './user.controller';

// The caller-ID lookup (GET /user/:phoneNumber) tells the incoming-call UI whether
// this caller is permitted for the requesting user, so it can auto-reject a
// disallowed business call before it rings.
describe('UserController — findUser caller-ID lookup: permittedForYou', () => {
  const makeController = () => {
    const userService: any = { findOrCreatePlaceholder: jest.fn() };
    const businessService: any = { resolveCallerIdentity: jest.fn(), getProfileByUserId: jest.fn() };
    const transactionService: any = {};
    const dataBrokerService: any = { isBusinessCallerAllowed: jest.fn() };
    const lookupService: any = { resolveExternalName: jest.fn().mockResolvedValue(null) };
    const externalLookupLimiter: any = { tryAcquire: jest.fn().mockReturnValue(true) };
    const controller = new UserController(userService, businessService, transactionService, dataBrokerService, lookupService, externalLookupLimiter);
    return { controller, userService, businessService, dataBrokerService, lookupService, externalLookupLimiter };
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
