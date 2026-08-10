import 'reflect-metadata';
import { AuthGuard } from '@nestjs/passport';
import { BusinessNumberSyncController } from './business-number-sync.controller';

/**
 * Device-sync endpoint: mobile calls this to bulk-cache every VERIFIED
 * business's active phone numbers, to recognize "business" category SMS
 * senders locally without a network call per message. The response shape is
 * a fixed contract for the mobile side — do not change it without flagging:
 * { numbers: string[] }.
 */
describe('BusinessNumberSyncController (device sync)', () => {
  let controller: BusinessNumberSyncController;
  let service: any;

  beforeEach(() => {
    service = { getVerifiedActiveNumbers: jest.fn() };
    controller = new BusinessNumberSyncController(service);
  });

  it('requires JWT auth (any authenticated user, not admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', BusinessNumberSyncController) ?? [];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(AuthGuard('jwt'));
  });

  it('returns only verified-business active numbers in the { numbers: string[] } shape', async () => {
    service.getVerifiedActiveNumbers.mockResolvedValue(['+27721234567', '+27829998888']);

    const result = await controller.sync();

    expect(service.getVerifiedActiveNumbers).toHaveBeenCalled();
    expect(result).toEqual({ numbers: ['+27721234567', '+27829998888'] });
  });
});
