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
    const controller = new UserController(userService, businessService, transactionService, dataBrokerService);
    return { controller, userService, businessService, dataBrokerService };
  };

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
});
