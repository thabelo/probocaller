import 'reflect-metadata';
import { AdminScamKeywordController } from './admin-scam-keyword.controller';
import { AdminGuard } from '../admin/admin.guard';

describe('AdminScamKeywordController', () => {
  let controller: AdminScamKeywordController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new AdminScamKeywordController(service);
  });

  it('is guarded by AdminGuard (admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', AdminScamKeywordController) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('lists all keywords, active and inactive', async () => {
    service.findAll.mockResolvedValue([{ id: 1, keyword: 'foo', active: false }]);
    const result = await controller.list();
    expect(service.findAll).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1, keyword: 'foo', active: false }]);
  });

  it('creates a keyword from the request body', async () => {
    service.create.mockResolvedValue({ id: 1, keyword: 'foo', active: true });
    const result = await controller.create({ keyword: 'foo' } as any);
    expect(service.create).toHaveBeenCalledWith('foo');
    expect(result).toEqual({ id: 1, keyword: 'foo', active: true });
  });

  it('updates a keyword by id', async () => {
    service.update.mockResolvedValue({ id: 5, keyword: 'foo', active: false });
    const result = await controller.update(5, { active: false } as any);
    expect(service.update).toHaveBeenCalledWith(5, { active: false });
    expect(result).toEqual({ id: 5, keyword: 'foo', active: false });
  });

  it('removes a keyword by id', async () => {
    await controller.remove(5);
    expect(service.remove).toHaveBeenCalledWith(5);
  });
});
