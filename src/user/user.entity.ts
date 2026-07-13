import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: false })
  isSpam: boolean;

  @Column({ default: 'user' })
  role: string;

  @Column({ default: false })
  isBusiness: boolean;

  // Subscription tier: 'free' | 'plus' | 'gold'. Drives premium badge, ad-free
  // experience and support priority (see SubscriptionService).
  @Column({ default: 'free' })
  tier: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  walletBalance: number;

  @Column('simple-array', { default: '' })
  spamList: string[];

  @Column({ type: 'simple-json', default: '[]' })
  notifications: { id: number; message: string; timestamp: Date; read: boolean }[];

  // Call-permission preset name (one of the six tiers) or 'custom'. Derived from the
  // four category policies below, which are the source of truth for gating.
  @Column({ default: 'all_paid_biz' })
  callPermissionMode: string;

  // The base tier the user selected; custom per-category rules are overrides layered
  // on top. Deleting a rule reverts that category to this base's value.
  @Column({ default: 'all_paid_biz' })
  callBasePreset: string;

  // Four-category call policy (see call/call-policy.ts). Each: free | paid | blocked.
  // The six tiers are named combinations; anything else reads as 'custom'.
  @Column({ default: 'free' })
  contactsCallPolicy: string; // in your device contacts

  @Column({ default: 'paid' })
  businessCallPolicy: string; // an identified business

  @Column({ default: 'free' })
  newCallPolicy: string; // first-time caller (has caller-ID, not a contact)

  @Column({ default: 'free' })
  unknownCallPolicy: string; // no caller-ID (private/withheld/unregistered)

  // Friendly name for each custom override rule, keyed by category
  // (contacts | business | newCaller | unknown). e.g. { newCaller: 'No strangers' }.
  @Column({ type: 'simple-json', default: '{}' })
  callRuleNames: Record<string, string>;

  // JSON array of { dayOfWeek: 0–6, startTime: "HH:mm", endTime: "HH:mm" }; empty = no restriction
  @Column({ type: 'simple-json', default: '[]' })
  allowedCallWindows: { dayOfWeek: number; startTime: string; endTime: string }[];

  @Column({ default: false })
  dataShareEnabled: boolean;

  // When true, viewing another user's profile does not write a data-access-log
  // row (Premium "incognito" — browse without being seen).
  @Column({ default: false })
  incognitoEnabled: boolean;

  // Which data categories the user consents to share
  @Column('simple-array', { default: '' })
  dataCategories: string[];

  // Opaque, crypto-random share code: PROBO-{8 chars} (unguessable, unique).
  // Legacy PROBO-{id} codes remain valid; lookups are format-agnostic.
  @Column({ nullable: true, unique: true })
  referralCode: string;

  // ID of the user who referred this account (null = organic signup).
  // Indexed: drives getReferralCode's count({ where: { referredBy } }) and
  // "who did I refer" lookups, which would otherwise seq-scan the users table.
  @Index('IDX_users_referredBy')
  @Column({ nullable: true })
  referredBy: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete marker. Set when the user deactivates their account.
  // JwtStrategy.validate rejects tokens whose user has this populated.
  @Column({ type: 'timestamp', nullable: true, default: null })
  deactivatedAt: Date | null;
}
