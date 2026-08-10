import 'reflect-metadata';
import { AuthGuard } from '@nestjs/passport';
import { SmsLogController } from './sms-log.controller';

/**
 * Device-upload endpoint: mobile uploads one log entry per evaluated SMS.
 * userId must always come from the authenticated request, never the body.
 */
describe('SmsLogController', () => {
  let controller: SmsLogController;
  let service: any;

  beforeEach(() => {
    service = { create: jest.fn() };
    controller = new SmsLogController(service);
  });

  it('requires JWT auth', () => {
    const guards = Reflect.getMetadata('__guards__', SmsLogController) ?? [];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(AuthGuard('jwt'));
  });

  it('creates a log entry scoped to the authenticated user, not the body', async () => {
    const dto = { address: '+27821234567', bodyHash: 'a'.repeat(32), category: 'contacts', decision: 'free' } as any;
    const created = { id: 1, userId: 7, ...dto };
    service.create.mockResolvedValue(created);
    const req = { user: { userId: 7 } } as any;

    const result = await controller.create(req, dto);

    expect(service.create).toHaveBeenCalledWith(7, dto);
    expect(result).toEqual(created);
  });
});
