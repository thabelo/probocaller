import { ProfileController } from './profile.controller';

describe('ProfileController — admin data profile routes', () => {
  const service = {
    adminGetUserDataProfile: jest.fn().mockResolvedValue({ ok: true }),
    adminUpdateUserDataBroker: jest.fn().mockResolvedValue({ ok: true }),
  } as any;
  const controller = new ProfileController(service);

  it('GET admin/user/:userId delegates to the service with a numeric id', async () => {
    await controller.adminGetUserDataProfile('7');
    expect(service.adminGetUserDataProfile).toHaveBeenCalledWith(7);
  });

  it('PATCH admin/user/:userId forwards the id and body to the service', async () => {
    await controller.adminUpdateUserDataBroker('7', { dataShareEnabled: false });
    expect(service.adminUpdateUserDataBroker).toHaveBeenCalledWith(7, { dataShareEnabled: false });
  });
});
