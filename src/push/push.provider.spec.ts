import { NoopPushProvider } from './push.provider';

/**
 * Until a Firebase project + service-account credentials exist, the transport
 * is a no-op. It must be honest about that — reporting "delivered" would make
 * the send path look healthy while no user ever gets a notification.
 */
describe('NoopPushProvider', () => {
  it('reports the push as NOT delivered rather than pretending', async () => {
    const res = await new NoopPushProvider().send({ token: 't', title: 'x', body: 'y' });
    expect(res.delivered).toBe(false);
  });

  // A missing transport is a configuration gap, not a dead handset — pruning
  // tokens here would wipe every device registration the moment FCM is absent.
  it('never marks a token invalid, so no device registration is pruned', async () => {
    const res = await new NoopPushProvider().send({ token: 't', title: 'x', body: 'y' });
    expect(res.invalidToken).toBeFalsy();
  });

  it('does not throw — push must never break the path that triggered it', async () => {
    await expect(new NoopPushProvider().send({ token: '', title: '', body: '' })).resolves.toBeDefined();
  });
});
