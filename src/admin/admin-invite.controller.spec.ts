import { AdminInviteController } from './admin-invite.controller';

describe('AdminInviteController', () => {
  let controller: AdminInviteController;
  let service: { create: jest.Mock; list: jest.Mock; redeem: jest.Mock };

  beforeEach(() => {
    service = { create: jest.fn(), list: jest.fn(), redeem: jest.fn() };
    controller = new AdminInviteController(service as any);
  });

  it('creates an invite on behalf of the admin', async () => {
    service.create.mockResolvedValue({ id: 1, token: 'abc' });
    const res = await controller.create({ user: { userId: 7 } } as any, { phoneNumber: '+27821234567' });
    expect(service.create).toHaveBeenCalledWith(7, { phoneNumber: '+27821234567' });
    expect(res).toEqual({ id: 1, token: 'abc' });
  });

  it('lists invites', async () => {
    service.list.mockResolvedValue([]);
    await controller.list();
    expect(service.list).toHaveBeenCalled();
  });

  it('redeems an invite for the authenticated user', async () => {
    service.redeem.mockResolvedValue({ id: 9, role: 'admin' });
    const res = await controller.redeem({ user: { userId: 9 } } as any, { token: 'abc' });
    expect(service.redeem).toHaveBeenCalledWith('abc', 9);
    expect(res).toEqual({ ok: true, role: 'admin' });
  });
});
