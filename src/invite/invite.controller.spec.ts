import { Test, TestingModule } from '@nestjs/testing';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { AdminGuard } from '../admin/admin.guard';

describe('InviteController', () => {
  let controller: InviteController;
  let service: any;

  beforeEach(async () => {
    service = {
      record: jest.fn(async () => ({ id: 1 })),
      listForAdmin: jest.fn(async () => []),
    };
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [InviteController],
      providers: [{ provide: InviteService, useValue: service }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = mod.get(InviteController);
  });

  /**
   * The inviter is taken from the JWT, never the body — otherwise anyone could
   * post invites attributed to another user and farm their referral chain.
   */
  it('records the invite against the authenticated user', async () => {
    await controller.record({ user: { userId: 42 } }, { phoneNumber: '0821140092' } as any);
    expect(service.record).toHaveBeenCalledWith(42, { phoneNumber: '0821140092' });
  });

  it('lists invites for admin, passing status and limit through', async () => {
    await controller.listForAdmin('accepted', '25');
    expect(service.listForAdmin).toHaveBeenCalledWith({ status: 'accepted', limit: 25 });
  });

  it('ignores a non-numeric limit rather than passing NaN to the query', async () => {
    await controller.listForAdmin(undefined, 'abc');
    expect(service.listForAdmin).toHaveBeenCalledWith({ status: undefined, limit: undefined });
  });
});
