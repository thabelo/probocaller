import { RetentionController } from './retention.controller';

describe('RetentionController', () => {
  it('triggers an on-demand purge', async () => {
    const service = { purgeExpired: jest.fn().mockResolvedValue({ callLogs: 1, auditLogs: 2 }) };
    const controller = new RetentionController(service as any);
    const res = await controller.purge();
    expect(service.purgeExpired).toHaveBeenCalled();
    expect(res).toEqual({ callLogs: 1, auditLogs: 2 });
  });
});
