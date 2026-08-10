import { ScamKeyword } from './scam-keyword.entity';

describe('ScamKeyword entity', () => {
  it('is a global keyword row with no per-user field', () => {
    const kw = new ScamKeyword();
    expect(kw).not.toHaveProperty('userId');
  });
});
