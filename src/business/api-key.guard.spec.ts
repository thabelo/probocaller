import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function ctx(request: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('allows an active key whose business is KYB-verified, attaching key + business', async () => {
    const apiKey = { id: 1, key: 'pk_abc', scopes: ['income_range'], business: { id: 3, userId: 7, verified: true } };
    const svc = { findActiveApiKey: jest.fn().mockResolvedValue(apiKey) } as any;
    const guard = new ApiKeyGuard(svc);
    const request: any = { headers: { 'x-api-key': 'pk_abc' } };

    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(svc.findActiveApiKey).toHaveBeenCalledWith('pk_abc');
    expect(request.apiKey).toBe(apiKey);
    expect(request.business).toBe(apiKey.business);
  });

  it('rejects a key whose business is NOT KYB-verified (403)', async () => {
    const apiKey = { id: 1, key: 'pk_abc', scopes: [], business: { id: 3, userId: 7, verified: false } };
    const svc = { findActiveApiKey: jest.fn().mockResolvedValue(apiKey) } as any;
    const guard = new ApiKeyGuard(svc);
    await expect(guard.canActivate(ctx({ headers: { 'x-api-key': 'pk_abc' } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing/invalid/revoked key (401)', async () => {
    const svc = { findActiveApiKey: jest.fn().mockResolvedValue(null) } as any;
    const guard = new ApiKeyGuard(svc);
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
