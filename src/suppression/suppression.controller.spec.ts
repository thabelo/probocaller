import 'reflect-metadata';
import { SuppressionController } from './suppression.controller';

describe('SuppressionController', () => {
  let controller: SuppressionController;
  let service: { unlist: jest.Mock; isSuppressed: jest.Mock };

  beforeEach(() => {
    service = { unlist: jest.fn(), isSuppressed: jest.fn() };
    controller = new SuppressionController(service as any);
  });

  it('unlist() delegates to the service with the number + reason', async () => {
    service.unlist.mockResolvedValue({ suppressed: true, alreadyListed: false });
    const res = await controller.unlist({ phoneNumber: '0821234567', reason: 'stop calling' } as any);
    expect(service.unlist).toHaveBeenCalledWith('0821234567', 'stop calling');
    expect(res).toEqual({ suppressed: true, alreadyListed: false });
  });

  it('status() reports whether a number is suppressed', async () => {
    service.isSuppressed.mockResolvedValue(true);
    const res = await controller.status('0821234567');
    expect(service.isSuppressed).toHaveBeenCalledWith('0821234567');
    expect(res).toEqual({ suppressed: true });
  });
});
