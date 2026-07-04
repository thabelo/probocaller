import { AdminController } from './admin.controller';

describe('AdminController — bulk update + CSV export', () => {
  let controller: AdminController;
  let adminService: { bulkUpdateUsers: jest.Mock; exportUsersCsv: jest.Mock };

  beforeEach(() => {
    adminService = { bulkUpdateUsers: jest.fn(), exportUsersCsv: jest.fn() };
    controller = new AdminController(adminService as any, {} as any, {} as any, {} as any);
  });

  it('delegates a bulk user update with the acting admin id', async () => {
    adminService.bulkUpdateUsers.mockResolvedValue({ updated: 2 });
    const res = await controller.bulkUpdateUsers({ user: { userId: 7 } } as any, { ids: [1, 2], patch: { isSpam: true } });
    expect(adminService.bulkUpdateUsers).toHaveBeenCalledWith([1, 2], { isSpam: true }, 7);
    expect(res).toEqual({ updated: 2 });
  });

  it('returns CSV text for the users export', async () => {
    adminService.exportUsersCsv.mockResolvedValue('id,name\n1,A\n');
    const res = await controller.exportUsers();
    expect(res).toBe('id,name\n1,A\n');
    expect(adminService.exportUsersCsv).toHaveBeenCalled();
  });
});
