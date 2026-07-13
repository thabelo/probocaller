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

describe('BusinessController — business self-service API keys', () => {
  const svc = {
    listApiKeysForUser: jest.fn().mockResolvedValue([{ id: 1, key: 'pk_mine' }]),
    createApiKeyForUser: jest.fn().mockResolvedValue({ id: 2, key: 'pk_new' }),
    revokeApiKeyForUser: jest.fn().mockResolvedValue({ id: 2, revoked: true }),
  } as any;
  const controller = new BusinessController(svc);
  const req = { user: { userId: 7 } } as any;

  it('lists only the caller-owned keys (scoped by req.user)', async () => {
    const res = await controller.listMyApiKeys(req);
    expect(svc.listApiKeysForUser).toHaveBeenCalledWith(7);
    expect(res).toEqual([{ id: 1, key: 'pk_mine' }]);
  });

  it('creates a scoped key for the caller-owned business named in the body', async () => {
    await controller.createMyApiKey(req, { businessId: 3, label: 'CRM', scopes: ['income_range'] });
    expect(svc.createApiKeyForUser).toHaveBeenCalledWith(7, 3, { label: 'CRM', scopes: ['income_range'] });
  });

  it('revokes only a caller-owned key (passes req.user + id)', async () => {
    await controller.revokeMyApiKey(req, 2);
    expect(svc.revokeApiKeyForUser).toHaveBeenCalledWith(7, 2);
  });
});
