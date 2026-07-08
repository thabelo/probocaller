import { BusinessController } from './business.controller';

describe('BusinessController — admin API keys', () => {
  const svc = {
    adminListApiKeys: jest.fn().mockResolvedValue([{ id: 1, key: 'pk_x', scopes: [] }]),
    createApiKey: jest.fn().mockResolvedValue({ id: 2, key: 'pk_new', scopes: ['income_range'] }),
    revokeApiKey: jest.fn().mockResolvedValue({ id: 2, revoked: true }),
  } as any;
  const controller = new BusinessController(svc);

  it('lists every API key', async () => {
    await controller.adminListApiKeys();
    expect(svc.adminListApiKeys).toHaveBeenCalled();
  });

  it('creates a scoped key for a business', async () => {
    const body = { label: 'CRM', scopes: ['income_range'] };
    const res = await controller.adminCreateApiKey(3, body);
    expect(svc.createApiKey).toHaveBeenCalledWith(3, body);
    expect(res).toEqual({ id: 2, key: 'pk_new', scopes: ['income_range'] });
  });

  it('revokes a key', async () => {
    await controller.adminRevokeApiKey(2);
    expect(svc.revokeApiKey).toHaveBeenCalledWith(2);
  });
});
