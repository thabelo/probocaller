import { UserAccessContextService } from './user-access-context.service';

/**
 * Resolves the two user facts app access depends on.
 *
 * `businessOptIn` is deliberately TRI-STATE and the server must read it the
 * same way the client does (react-native/src/utils/businessAccess.ts): true =
 * opted in, false = explicitly opted OUT (hide business surfaces even for a
 * registered company), null = never answered, so fall back to `isBusiness` and
 * never lock a real business owner out of their own tools.
 */
describe('UserAccessContextService', () => {
  const make = (user: unknown, business: unknown) =>
    new UserAccessContextService(
      { findOne: jest.fn().mockResolvedValue(user) } as any,
      { findOne: jest.fn().mockResolvedValue(business) } as any,
    );

  it('opted in: has business access', async () => {
    const ctx = await make({ id: 1, businessOptIn: true, isBusiness: false }, null).forUser(1);
    expect(ctx.hasBusinessAccess).toBe(true);
  });

  it('explicitly opted out: no business access even for a registered company', async () => {
    const ctx = await make({ id: 1, businessOptIn: false, isBusiness: true }, null).forUser(1);
    expect(ctx.hasBusinessAccess).toBe(false);
  });

  it('never answered: falls back to being a registered business', async () => {
    const ctx = await make({ id: 1, businessOptIn: null, isBusiness: true }, null).forUser(1);
    expect(ctx.hasBusinessAccess).toBe(true);
  });

  it('KYB verification comes from the business record', async () => {
    const ctx = await make({ id: 1, businessOptIn: true }, { verified: true }).forUser(1);
    expect(ctx.kybVerified).toBe(true);
  });

  it('no business record: not verified', async () => {
    const ctx = await make({ id: 1, businessOptIn: true }, null).forUser(1);
    expect(ctx.kybVerified).toBe(false);
  });

  it('unknown user gets the most restrictive context', async () => {
    const ctx = await make(null, null).forUser(999);
    expect(ctx).toEqual({ hasBusinessAccess: false, kybVerified: false });
  });
});
