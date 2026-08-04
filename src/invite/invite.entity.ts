import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

/** How the invite was delivered. SMS today; room for more without a migration. */
export type InviteChannel = 'sms';

/**
 * `sent` — the invite left the device.
 * `accepted` — someone signed up on that number carrying the inviter's code.
 */
export type InviteStatus = 'sent' | 'accepted';

/**
 * A person-to-person invite to join ProboCaller.
 *
 * Distinct from `admin_invites`, which grants an admin role. This records an
 * ordinary user inviting someone to the product, so the referral chain
 * ([[referral]] pays 3% lifetime) has an auditable origin rather than only
 * surfacing once the invitee happens to sign up.
 */
@Entity('invites')
@Index(['status', 'createdAt'])
// The accept-on-signup path looks invites up by the invited number.
@Index(['phoneNumber'])
// One live invite per (inviter, number) — re-inviting refreshes that row rather
// than piling up duplicates in the admin view.
@Index(['inviterUserId', 'phoneNumber'], { unique: true })
export class Invite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  inviterUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviterUserId' })
  inviter: User;

  /** The invited number, normalised to E.164 so lookups match on signup. */
  @Column()
  phoneNumber: string;

  /** The inviter's code as sent — kept even if their code is later reissued. */
  @Column()
  referralCode: string;

  @Column({ default: 'sms' })
  channel: InviteChannel;

  @Column({ default: 'sent' })
  status: InviteStatus;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
