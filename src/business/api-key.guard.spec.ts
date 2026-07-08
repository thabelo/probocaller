import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function ctx(headers: Record<string, any>, req: any = {}): ExecutionContext {
  const request = { headers, ...req };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('allows a valid key and attaches the business to the request', async () => {
    const business = { id: 3, userId: 7, companyName: 'Acme' };
    const svc = { findByApiKey: jest.fn().mockResolvedValue(business) } as any;
    const guard = new ApiKeyGuard(svc);
    const request: any = { headers: { 'x-api-key': 'pk_abc' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(svc.findByApiKey).toHaveBeenCalledWith('pk_abc');
    expect(request.business).toBe(business);
  });

  it('rejects a missing or invalid key', async () => {
    const svc = { findByApiKey: jest.fn().mockResolvedValue(null) } as any;
    const guard = new ApiKeyGuard(svc);
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
