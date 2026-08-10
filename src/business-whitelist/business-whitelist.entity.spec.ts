import { WhitelistedNumber } from './business-whitelist.entity';

describe('WhitelistedNumber entity', () => {
  it('is a global whitelist row with no per-user field', () => {
    const w = new WhitelistedNumber();
    expect(w).not.toHaveProperty('userId');
  });
});
