import { BusinessController } from './business.controller';

describe('BusinessController — admin API keys', () => {
  const svc = {
    adminListApiKeys: jest.fn().mockResolvedValue([{ id: 3, apiKey: 'pk_x' }]),
    generateApiKey: jest.fn().mockResolvedValue({ id: 3, apiKey: 'pk_new' }),
  } as any;
  const controller = new BusinessController(svc);

  it('lists businesses with their API keys', async () => {
    await controller.adminListApiKeys();
    expect(svc.adminListApiKeys).toHaveBeenCalled();
  });

  it('generates (rotates) a business API key', async () => {
    const res = await controller.adminGenerateApiKey(3);
    expect(svc.generateApiKey).toHaveBeenCalledWith(3);
    expect(res).toEqual({ id: 3, apiKey: 'pk_new' });
  });
});
