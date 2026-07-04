import 'reflect-metadata';
import { ErrorLogController } from './error-log.controller';
import { AdminGuard } from '../admin/admin.guard';

describe('ErrorLogController', () => {
  let controller: ErrorLogController;
  let service: { record: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    service = { record: jest.fn(), list: jest.fn() };
    controller = new ErrorLogController(service as any);
  });

  it('records a client error report', async () => {
    service.record.mockResolvedValue({ id: 3 });
    const body = { source: 'mobile', level: 'error', message: 'boom' } as any;
    const res = await controller.report(body);
    expect(service.record).toHaveBeenCalledWith(body);
    expect(res).toEqual({ id: 3 });
  });

  it('lists error logs for admin with level/source + parsed limit', async () => {
    service.list.mockResolvedValue([]);
    await controller.listForAdmin('error', 'mobile', '25');
    expect(service.list).toHaveBeenCalledWith({ level: 'error', source: 'mobile', limit: 25 });
  });

  it('guards the admin listing with AdminGuard', () => {
    const guards = Reflect.getMetadata('__guards__', ErrorLogController.prototype.listForAdmin) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('does NOT guard the public report endpoint (crashes can happen pre-auth)', () => {
    const guards = Reflect.getMetadata('__guards__', ErrorLogController.prototype.report) ?? [];
    expect(guards).toHaveLength(0);
  });
});
