import 'reflect-metadata';
import { AuthGuard } from '@nestjs/passport';
import { BusinessWhitelistController } from './business-whitelist.controller';

/**
 * Device-sync endpoint: mobile calls this to bypass call-screening/spam
 * blocking for globally-verified business numbers. The response shape is a
 * fixed contract for the mobile side — do not change it without flagging:
 * { numbers: string[] }.
 */
describe('BusinessWhitelistController (device sync)', () => {
  let controller: BusinessWhitelistController;
  let service: any;

  beforeEach(() => {
    service = { getActiveNumbers: jest.fn() };
    controller = new BusinessWhitelistController(service);
  });

  it('requires JWT auth (any authenticated user, not admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', BusinessWhitelistController) ?? [];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(AuthGuard('jwt'));
  });

  it('returns only active numbers in the { numbers: string[] } shape', async () => {
    service.getActiveNumbers.mockResolvedValue(['+27721234567', '+27729998888']);

    const result = await controller.sync();

    expect(service.getActiveNumbers).toHaveBeenCalled();
    expect(result).toEqual({ numbers: ['+27721234567', '+27729998888'] });
  });
});
