import { AuditController } from './audit.controller';

describe('AuditController', () => {
  let controller: AuditController;
  let service: { list: jest.Mock };

  beforeEach(() => {
    service = { list: jest.fn().mockResolvedValue([]) };
    controller = new AuditController(service as any);
  });

  it('lists audit logs with parsed action/actor/limit filters', async () => {
    await controller.list('gdpr.export', '9', '25');
    expect(service.list).toHaveBeenCalledWith({ action: 'gdpr.export', actorUserId: 9, limit: 25 });
  });

  it('omits numeric filters when not provided', async () => {
    await controller.list(undefined, undefined, undefined);
    expect(service.list).toHaveBeenCalledWith({ action: undefined, actorUserId: undefined, limit: undefined });
  });
});
