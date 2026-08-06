import { AdminController } from './admin.controller';

describe('AdminController — bulk update + CSV export', () => {
  let controller: AdminController;
  let adminService: { bulkUpdateUsers: jest.Mock; exportUsersCsv: jest.Mock };

  beforeEach(() => {
    adminService = { bulkUpdateUsers: jest.fn(), exportUsersCsv: jest.fn() };
    controller = new AdminController(adminService as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('delegates a bulk user update with the acting admin id', async () => {
    adminService.bulkUpdateUsers.mockResolvedValue({ updated: 2 });
    const res = await controller.bulkUpdateUsers({ user: { userId: 7 } } as any, { ids: [1, 2], patch: { isSpam: true } });
    expect(adminService.bulkUpdateUsers).toHaveBeenCalledWith([1, 2], { isSpam: true }, 7);
    expect(res).toEqual({ updated: 2 });
  });

  it('returns CSV text for the users export', async () => {
    adminService.exportUsersCsv.mockResolvedValue('id,name\n1,A\n');
    const res = await controller.exportUsers();
    expect(res).toBe('id,name\n1,A\n');
    expect(adminService.exportUsersCsv).toHaveBeenCalled();
  });
});

/**
 * The admin business endpoints, at the wiring level.
 *
 * The service enforces the logo rule, but the endpoint is what an admin
 * actually hits — and this endpoint's body type had no logoUrl at all, so the
 * rule was unsatisfiable through the only door an admin has. Types alone do
 * not prove a value survives the handler, so these assert what reaches the
 * service.
 */
describe('AdminController — business endpoints carry the logo', () => {
  let controller: AdminController;
  let businessService: { adminRegisterBusiness: jest.Mock; adminUpdateProfile: jest.Mock };

  beforeEach(() => {
    businessService = { adminRegisterBusiness: jest.fn(), adminUpdateProfile: jest.fn() };
    controller = new AdminController({} as any, businessService as any, {} as any, {} as any, {} as any);
  });

  it('passes the logo through when an admin creates a business', async () => {
    businessService.adminRegisterBusiness.mockResolvedValue({ id: 9 });
    await controller.adminCreateBusiness({
      userId: 4, companyName: 'Riverside', industry: 'insurance',
      country: 'ZA', logoUrl: '/business/logo/a.png',
    } as any);

    expect(businessService.adminRegisterBusiness).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ logoUrl: '/business/logo/a.png' }),
    );
  });

  /** The userId is the route's own argument, never part of the profile. */
  it('does not smuggle userId into the business payload', async () => {
    businessService.adminRegisterBusiness.mockResolvedValue({ id: 9 });
    await controller.adminCreateBusiness({
      userId: 4, companyName: 'Riverside', industry: 'insurance',
      country: 'ZA', logoUrl: '/business/logo/a.png',
    } as any);

    const [, payload] = businessService.adminRegisterBusiness.mock.calls[0];
    expect(payload).not.toHaveProperty('userId');
  });

  it('passes a logo change through on update', async () => {
    businessService.adminUpdateProfile.mockResolvedValue({ id: 3 });
    await controller.updateBusiness(3, { logoUrl: '/business/logo/b.png' } as any);
    expect(businessService.adminUpdateProfile).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ logoUrl: '/business/logo/b.png' }),
    );
  });
});
