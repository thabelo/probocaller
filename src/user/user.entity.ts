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

  // Business mode is OPT-IN and free: a normal account has no business surface
  // until the user explicitly enables it (after the intro/onboarding). Distinct
  // from `isBusiness`, which means "has actually registered a company".
  @Column({ default: false })
  businessOptIn: boolean;

  // Subscription tier: 'free' | 'plus' | 'gold'. Drives premium badge, ad-free
  // experience and support priority (see SubscriptionService).
  @Column({ default: 'free' })
  tier: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  walletBalance: number;

  @Column('simple-array', { default: '' })
  spamList: string[];

  @Column({ type: 'simple-json', default: '[]' })
  notifications: {
    id: number;
    message: string;
    timestamp: Date;
    read: boolean;
    /**
     * Optional routing metadata. The app infers a destination from `message`
     * when these are absent — which is all a legacy row can offer — but a row
     * that knows what it is about can open the exact thing rather than a list.
     */
    kind?: string;
    target?: string;
  }[];

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

  // Saved custom rules: standalone named four-category policies beside the six
  // tiers in one radio group (driven by data-broker.service.spec custom-rules tests).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  customCallRules: { id: string; name: string; contacts: string; business: string; newCaller: string; unknown: string }[];

  // Which custom rule is active ('' = the callBasePreset tier is active).
  @Column({ default: '' })
  selectedCustomRuleId: string;

  // JSON array of { dayOfWeek: 0–6, startTime: "HH:mm", endTime: "HH:mm" }; empty = no restriction
  @Column({ type: 'simple-json', default: '[]' })
  allowedCallWindows: { dayOfWeek: number; startTime: string; endTime: string }[];

  // SMS-permission preset name (one of the six tiers) or 'custom'. Independent
  // sibling of the call-permission columns above — see data-broker/sms-policy.ts.
  @Column({ default: 'all_paid_biz' })
  smsPermissionMode: string;

  // The base tier the user selected for SMS; custom per-category rules are
  // overrides layered on top.
  @Column({ default: 'all_paid_biz' })
  smsBasePreset: string;

  // Four-category SMS policy (see data-broker/sms-policy.ts). Each: free | paid | blocked.
  @Column({ default: 'free' })
  contactsSmsPolicy: string; // in your device contacts

  @Column({ default: 'paid' })
  businessSmsPolicy: string; // an identified business

  @Column({ default: 'free' })
  newSmsPolicy: string; // first-time sender (has a sender ID, not a contact)

  @Column({ default: 'free' })
  unknownSmsPolicy: string; // no sender ID

  // Saved custom SMS rules: standalone named four-category policies beside the
  // six tiers in one radio group. Fully independent of customCallRules.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  customSmsRules: { id: string; name: string; contacts: string; business: string; newSender: string; unknown: string }[];

  // Which custom SMS rule is active ('' = the smsBasePreset tier is active).
  @Column({ default: '' })
  selectedCustomSmsRuleId: string;

  @Column({ default: false })
  dataShareEnabled: boolean;

  // Consent for our INTERNAL analyser (an LLM, or the rule-based stand-in until
  // one is wired) to read this user's SMS CONTENT and suggest profile updates
  // and survey questions. Default FALSE, and it is load-bearing: the server
  // otherwise only ever receives an on-device MD5 hash of an SMS, never the
  // text (see SmsLog). This flag is the single switch that authorises the text
  // to reach the server at all, for this user only. Off restores the hash-only
  // guarantee; turning it off again is a real withdrawal.
  @Column({ default: false })
  smsAnalysisConsent: boolean;

  // Whether a business that buys this user's data also receives their phone
  // number. Defaults TRUE because the platform already handed the number over
  // with every lead — this flag is the control that was missing, not a new
  // capability, so switching it on for existing accounts changes nothing and
  // switching it off is a real withdrawal of consent.
  @Column({ default: true })
  phoneShareEnabled: boolean;

  // Opt-in to in-app ads. Off by default: the user must actively choose ads
  // before any are shown, and only opted-in users earn the AD_REVENUE_SHARE_RATE
  // share of the revenue their impressions produce.
  @Column({ default: false })
  adsEnabled: boolean;

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

  // Relative path of the optional profile photo, under uploads/. The bytes stay
  // on disk; only the pointer lives here. Null means the user never set one.
  @Column({ type: 'varchar', nullable: true, default: null })
  avatarPath: string | null;
}
