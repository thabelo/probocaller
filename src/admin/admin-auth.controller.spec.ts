import { ForbiddenException } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';

describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let jwt: { sign: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    jwt = { sign: jest.fn().mockReturnValue('jwt.tok.en') };
    userRepo = { findOne: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AdminAuthController(jwt as any, userRepo as any);
  });

  it('logs an existing admin in by setting an HttpOnly cookie and returns the user (no token in body)', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, role: 'admin', phoneNumber: '+27821234567', name: 'Admin', email: 'a@b' });

    const result = await controller.login({ phoneNumber: '+27821234567' }, res as any);

    expect(jwt.sign).toHaveBeenCalledWith({ sub: 1, phoneNumber: '+27821234567' });
    expect(res.cookie).toHaveBeenCalledWith('accessToken', 'jwt.tok.en', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
    }));
    expect(result).toEqual({ user: { id: 1, phoneNumber: '+27821234567', name: 'Admin', role: 'admin' } });
    expect((result as any).accessToken).toBeUndefined();
  });

  it('rejects a non-admin user and sets no cookie', async () => {
    userRepo.findOne.mockResolvedValue({ id: 2, role: 'user', phoneNumber: '+27' });
    await expect(controller.login({ phoneNumber: '+27' }, res as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects an unknown phone (no auto-create of admins) and sets no cookie', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(controller.login({ phoneNumber: '+27000' }, res as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('logs out by clearing the cookie', () => {
    const out = controller.logout(res as any);
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.objectContaining({ httpOnly: true }));
    expect(out).toEqual({ ok: true });
  });
});
