// Money is held to 4 decimal places to match the wallet column precision
// (User.walletBalance / Transaction.amount are decimal(10,4)). This is the
// single shared rounding helper — PayToContact, Call, Profile, User and
// Referral logic all import it so wallet maths agrees to the cent.
export const round4 = (n: number): number => parseFloat(n.toFixed(4));
