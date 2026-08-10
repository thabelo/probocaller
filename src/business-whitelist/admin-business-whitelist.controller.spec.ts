import 'reflect-metadata';
import { AdminBusinessWhitelistController } from './admin-business-whitelist.controller';
import { AdminGuard } from '../admin/admin.guard';

describe('AdminBusinessWhitelistController', () => {
  let controller: AdminBusinessWhitelistController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new AdminBusinessWhitelistController(service);
  });

  it('is guarded by AdminGuard (admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', AdminBusinessWhitelistController) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('lists all whitelisted numbers, active and inactive', async () => {
    service.findAll.mockResolvedValue([{ id: 1, phoneNumber: '+27721234567', active: false }]);
    const result = await controller.list();
    expect(service.findAll).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1, phoneNumber: '+27721234567', active: false }]);
  });

  it('creates a whitelisted number from the request body', async () => {
    const dto = { phoneNumber: '+27721234567', label: 'Acme Bank' };
    service.create.mockResolvedValue({ id: 1, ...dto, active: true });
    const result = await controller.create(dto as any);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 1, ...dto, active: true });
  });

  it('updates a whitelisted number by id', async () => {
    service.update.mockResolvedValue({ id: 5, phoneNumber: '+27721234567', active: false });
    const result = await controller.update(5, { active: false } as any);
    expect(service.update).toHaveBeenCalledWith(5, { active: false });
    expect(result).toEqual({ id: 5, phoneNumber: '+27721234567', active: false });
  });

  it('removes a whitelisted number by id', async () => {
    await controller.remove(5);
    expect(service.remove).toHaveBeenCalledWith(5);
  });
});
