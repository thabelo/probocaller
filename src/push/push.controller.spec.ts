import { PushController } from './push.controller';

/**
 * The device-registration endpoints the RN app calls on start / token refresh /
 * sign-out. Registration is always scoped to the authenticated user from the
 * JWT — never to a userId in the body, which a client could forge to hijack
 * another account's notifications.
 */
describe('PushController', () => {
  const makeController = () => {
    const service: any = {
      registerDevice: jest.fn().mockResolvedValue({ id: 1 }),
      unregisterDevice: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return { controller: new PushController(service), service };
  };

  it('registers the device against the authenticated user', async () => {
    const { controller, service } = makeController();
    await controller.register({ user: { userId: 7 } } as any, { token: 'tok-abc', platform: 'android' } as any);
    expect(service.registerDevice).toHaveBeenCalledWith(7, 'tok-abc', 'android');
  });

  // Trusting a body-supplied userId would let any authenticated caller receive
  // (or silence) another user's notifications.
  it('ignores a userId supplied in the body', async () => {
    const { controller, service } = makeController();
    await controller.register(
      { user: { userId: 7 } } as any,
      { token: 'tok-abc', platform: 'android', userId: 99 } as any,
    );
    expect(service.registerDevice).toHaveBeenCalledWith(7, 'tok-abc', 'android');
  });

  it('defaults the platform to android when unspecified', async () => {
    const { controller, service } = makeController();
    await controller.register({ user: { userId: 7 } } as any, { token: 'tok-abc' } as any);
    expect(service.registerDevice).toHaveBeenCalledWith(7, 'tok-abc', 'android');
  });

  it('unregisters only the caller’s own device', async () => {
    const { controller, service } = makeController();
    await controller.unregister({ user: { userId: 7 } } as any, { token: 'tok-abc' } as any);
    expect(service.unregisterDevice).toHaveBeenCalledWith(7, 'tok-abc');
  });
});
