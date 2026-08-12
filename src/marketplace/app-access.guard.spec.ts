import { ForbiddenException } from '@nestjs/common';
import { AppAccessGuard, REQUIRES_APP } from './app-access.guard';

/**
 * Route-level enforcement of app entitlement.
 *
 * The guard is what makes the storefront's locked states real: a client that
 * ignores the UI and calls the endpoint directly still gets refused. It is
 * opt-in per route, so an unannotated handler is unaffected — but once
 * annotated, it fails closed on anything it cannot confirm.
 */
describe('AppAccessGuard', () => {
  const contextFor = (userId?: number) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user: userId ? { userId } : undefined }),
      }),
    }) as any;

  const make = (appKey: string | undefined, allowed: boolean) =>
    new AppAccessGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(appKey) } as any,
      { canAccess: jest.fn().mockResolvedValue(allowed) } as any,
      { forUser: jest.fn().mockResolvedValue({ hasBusinessAccess: true, kybVerified: true }) } as any,
    );

  it('lets an unannotated route through untouched', async () => {
    await expect(make(undefined, false).canActivate(contextFor(7))).resolves.toBe(true);
  });

  it('allows a user who has the app', async () => {
    await expect(make('audience-leads', true).canActivate(contextFor(7))).resolves.toBe(true);
  });

  it('refuses a user who does not', async () => {
    await expect(
      make('audience-leads', false).canActivate(contextFor(7)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the request carries no authenticated user', async () => {
    await expect(
      make('audience-leads', true).canActivate(contextFor(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads the app key from route metadata', () => {
    expect(REQUIRES_APP).toBe('requires_app');
  });
});
