import 'reflect-metadata';
import { AirtimeController } from './airtime.controller';

describe('AirtimeController', () => {
  let controller: AirtimeController;
  let service: { redeem: jest.Mock; listMine: jest.Mock; networks: jest.Mock };

  beforeEach(() => {
    service = { redeem: jest.fn(), listMine: jest.fn(), networks: jest.fn() };
    controller = new AirtimeController(service as any);
  });

  it('redeem() delegates to the service with the auth user id + dto', async () => {
    service.redeem.mockResolvedValue({ id: 1, status: 'delivered' });
    const dto = { amount: 20, phoneNumber: '0821234567', network: 'MTN' };
    const res = await controller.redeem({ user: { userId: 9 } } as any, dto as any);
    expect(service.redeem).toHaveBeenCalledWith(9, dto);
    expect(res).toEqual({ id: 1, status: 'delivered' });
  });

  it('list() returns the caller’s redemption history', async () => {
    service.listMine.mockResolvedValue([]);
    await controller.list({ user: { userId: 9 } } as any);
    expect(service.listMine).toHaveBeenCalledWith(9);
  });

  it('networks() returns supported networks + limits', () => {
    controller.networks();
    expect(service.networks).toHaveBeenCalled();
  });
});
