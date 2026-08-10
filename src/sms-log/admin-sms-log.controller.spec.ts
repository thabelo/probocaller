import 'reflect-metadata';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSmsLogController } from './admin-sms-log.controller';

describe('AdminSmsLogController', () => {
  let controller: AdminSmsLogController;
  let service: any;

  beforeEach(() => {
    service = { findAllForUser: jest.fn() };
    controller = new AdminSmsLogController(service);
  });

  it('is guarded by AdminGuard (admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', AdminSmsLogController) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it("lists a user's SMS log entries by route param", async () => {
    service.findAllForUser.mockResolvedValue([{ id: 1, userId: 42, category: 'contacts', decision: 'free' }]);

    const result = await controller.list(42);

    expect(service.findAllForUser).toHaveBeenCalledWith(42);
    expect(result).toEqual([{ id: 1, userId: 42, category: 'contacts', decision: 'free' }]);
  });
});
