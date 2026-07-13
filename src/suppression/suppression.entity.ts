import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type SuppressionSource = 'public' | 'admin' | 'user';

/**
 * A number the public has asked us NOT to hold or surface (POPIA/GDPR opt-out).
 *
 * We store only the keyed HMAC of the number (`numberHash`) — never the plaintext.
 * A suppressed number is excluded from caller-ID lookups and blocked from being
 * re-added by future community reports / uploads.
 */
@Entity('suppression_entries')
export class SuppressionEntry {
  @PrimaryGeneratedColumn()
  id: number;

  /** HMAC-SHA256(normalized number, pepper). Unique so unlisting is idempotent. */
  @Index({ unique: true })
  @Column()
  numberHash: string;

  /** Optional free-text reason supplied by the requester. */
  @Column({ nullable: true, type: 'text' })
  reason: string;

  /** Where the opt-out came from. */
  @Column({ default: 'public' })
  source: SuppressionSource;

  @CreateDateColumn()
  createdAt: Date;
}
