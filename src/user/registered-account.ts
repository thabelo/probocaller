import type { User } from './user.entity';

/**
 * Whether a `users` row is a real account or just a phonebook entry.
 *
 * Uploading contacts creates a User row per contact (see
 * `UserService.addMultipleContacts`), so most of the table is people who have
 * never signed up. Nothing marks the difference explicitly — but every real
 * account passes through `login` or `signup`, and both call
 * `assignReferralCode`, while the contact-directory path never does. On
 * production that separates 18 real accounts from 343 phonebook rows, and every
 * row holding money has a code.
 *
 * This matters for money, not just labelling: treating a phonebook row as a
 * member makes the app skip the "you have money waiting" SMS and credit a
 * wallet nobody has ever logged into.
 *
 * Kept in one place so the signal has a single definition. An explicit
 * `registeredAt` column would be sturdier — a future change to referral
 * handling would silently move money if this were left implicit and scattered.
 */
export function isRegisteredAccount(user: Pick<User, 'referralCode'> | null | undefined): boolean {
  return !!user && !!String(user.referralCode ?? '').trim();
}
