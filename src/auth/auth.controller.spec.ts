import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController (cookie-based login for any user)', () => {
  let controller: AuthController;
  let jwt: { sign: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let businessRepo: { findOne: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    jwt = { sign: jest.fn().mockReturnValue('jwt.tok.en') };
    userRepo = { findOne: jest.fn() };
    businessRepo = { findOne: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AuthController(jwt as any, userRepo as any, businessRepo as any);
  });

  it('logs any existing (non-admin) user in via an HttpOnly cookie and returns the profile with role', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, role: 'user', phoneNumber: '+27810000001', name: 'Test User 1', isBusiness: true });

    const result = await controller.login({ phoneNumber: '+27810000001' }, res as any);

    expect(jwt.sign).toHaveBeenCalledWith({ sub: 5, phoneNumber: '+27810000001' });
    expect(res.cookie).toHaveBeenCalledWith('accessToken', 'jwt.tok.en', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
    }));
    expect(result).toEqual({ user: { id: 5, phoneNumber: '+27810000001', name: 'Test User 1', role: 'user', isBusiness: true } });
    expect((result as any).accessToken).toBeUndefined();
  });

  it('rejects an unknown phone (no auto-create) and sets no cookie', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(controller.login({ phoneNumber: '+27000' }, res as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects a deactivated account and sets no cookie', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, role: 'user', phoneNumber: '+27', deactivatedAt: new Date('2020-01-01') });
    await expect(controller.login({ phoneNumber: '+27' }, res as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('logs out by clearing the cookie', () => {
    const out = controller.logout(res as any);
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.objectContaining({ httpOnly: true }));
    expect(out).toEqual({ ok: true });
  });

  describe('impersonate (admin "view as business")', () => {
    const adminReq = { user: { userId: 152 } };

    it("lets an admin view as a business: mints an owner session tagged with the admin id", async () => {
      userRepo.findOne.mockImplementation(({ where }: any) =>
        where.id === 152
          ? Promise.resolve({ id: 152, role: 'admin', phoneNumber: '+27admin' })
          : Promise.resolve({ id: 7, role: 'user', name: 'Owner', phoneNumber: '+27owner', isBusiness: true }));
      businessRepo.findOne.mockResolvedValue({ id: 3, userId: 7, companyName: 'Acme' });

      const out = await controller.impersonate(adminReq as any, { businessId: 3 }, res as any);

      expect(jwt.sign).toHaveBeenCalledWith({ sub: 7, phoneNumber: '+27owner', imp: 152 });
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'jwt.tok.en', expect.objectContaining({ httpOnly: true }));
      expect(out).toEqual({
        user: { id: 7, phoneNumber: '+27owner', name: 'Owner', role: 'user', isBusiness: true },
        viewingAs: { businessId: 3, companyName: 'Acme' },
      });
    });

    it('refuses a non-admin caller and sets no cookie', async () => {
      userRepo.findOne.mockResolvedValue({ id: 5, role: 'user' });
      await expect(controller.impersonate({ user: { userId: 5 } } as any, { businessId: 3 }, res as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('exits back to the admin using the imp claim', async () => {
      userRepo.findOne.mockResolvedValue({ id: 152, role: 'admin', name: 'Admin', phoneNumber: '+27admin', isBusiness: false });
      const out = await controller.exitImpersonation({ user: { userId: 7, impersonatorId: 152 } } as any, res as any);
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 152, phoneNumber: '+27admin' });
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'jwt.tok.en', expect.objectContaining({ httpOnly: true }));
      expect(out).toEqual({ user: { id: 152, phoneNumber: '+27admin', name: 'Admin', role: 'admin', isBusiness: false } });
    });

    it('refuses to exit when the session is not an impersonation', async () => {
      await expect(controller.exitImpersonation({ user: { userId: 7, impersonatorId: null } } as any, res as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  it('returns the phone in international (E.164) form so the client can derive the region', async () => {
    // Account stored nationally; the client must still see +27…
    userRepo.findOne.mockResolvedValue({ id: 29, role: 'user', name: 'MTN HO', phoneNumber: '0831119999', isBusiness: true });
    const out: any = await controller.login({ phoneNumber: '+27831119999' }, res as any);
    expect(out.user.phoneNumber).toBe('+27831119999');
  });
});
