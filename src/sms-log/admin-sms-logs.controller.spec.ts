import 'reflect-metadata';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSmsLogsController } from './admin-sms-logs.controller';

/**
 * Cross-user admin SMS-logs endpoint (GET /admin/sms-logs). One call returns
 * the paginated rows plus the aggregate stats so the page fetches once.
 */
describe('AdminSmsLogsController', () => {
  let controller: AdminSmsLogsController;
  let service: any;

  beforeEach(() => {
    service = {
      findFiltered: jest.fn(),
      statsFor: jest.fn(),
    };
    controller = new AdminSmsLogsController(service);
  });

  it('is guarded by AdminGuard (admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', AdminSmsLogsController) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('returns { data, total, stats } from a single query, passing the DTO through', async () => {
    const query = { decision: 'blocked', page: 2, limit: 10 } as any;
    const stats = {
      byDecision: { free: 0, paid: 0, blocked: 3 },
      byCategory: { contacts: 0, business: 0, newSender: 3, unknown: 0 },
      overTime: [{ date: '2026-01-02', blocked: 3, paid: 0, free: 0 }],
      topSenders: [{ address: '+27820000003', count: 3, blocked: 3 }],
    };
    service.findFiltered.mockResolvedValue({ data: [{ id: 1 }], total: 3 });
    service.statsFor.mockResolvedValue(stats);

    const result = await controller.list(query);

    expect(service.findFiltered).toHaveBeenCalledWith(query);
    expect(service.statsFor).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [{ id: 1 }], total: 3, stats });
  });
});
