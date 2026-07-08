import { ApiKey } from './api-key.entity';

describe('ApiKey entity', () => {
  it('holds a key, its business, scopes and revoked flag', () => {
    const k = new ApiKey();
    k.key = 'pk_abc';
    k.businessId = 3;
    k.scopes = ['income_range', 'age_range'];
    k.revoked = false;
    k.callCount = 0;
    k.totalSpend = 0;
    expect(k.key).toBe('pk_abc');
    expect(k.scopes).toContain('age_range');
    expect(k.revoked).toBe(false);
    expect(k.callCount).toBe(0);
    expect(k.totalSpend).toBe(0);
  });
});
