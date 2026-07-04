import { round4 } from './round4';

// Money is held to 4 decimal places across the codebase to match the wallet
// column precision (User.walletBalance / Transaction.amount are decimal(10,4)).
// `round4` is the single shared rounding helper so PayToContact, Call, Profile,
// User and Referral logic all agree to the cent (and beyond).
describe('round4', () => {
  it('rounds to 4 decimal places', () => {
    expect(round4(1.234567)).toBe(1.2346);
  });

  it('leaves already-4dp values untouched', () => {
    expect(round4(2.7)).toBe(2.7);
  });

  it('returns a number, not a string', () => {
    expect(typeof round4(3)).toBe('number');
  });

  it('handles the 3% commission case precisely (round-half behaviour)', () => {
    // 0.05 * 0.03 = 0.0015 -> stays at 4dp
    expect(round4(0.05 * 0.03)).toBe(0.0015);
    // 1.52 * 0.03 = 0.0456
    expect(round4(1.52 * 0.03)).toBe(0.0456);
  });
});
