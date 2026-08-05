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

export type PendingTransferStatus = 'pending' | 'claimed' | 'refunded';

/**
 * Money sent to a number that is not on ProboCaller yet.
 *
 * The sender is debited at once — the funds have left their wallet and must be
 * accounted for somewhere. Holding them here, rather than crediting a
 * placeholder account, means no real balance ever sits against an unverified
 * number that nobody controls: whoever signs up on that number claims it, and
 * if nobody does the amount is refunded to the sender.
 */
@Entity('pending_transfers')
// The claim path runs on every signup and filters on exactly this pair.
@Index(['recipientPhone', 'status'])
@Index(['status', 'expiresAt'])
export class PendingTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  senderUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderUserId' })
  sender: User;

  /** E.164, so a signup on any stored format still matches. */
  @Column()
  recipientPhone: string;

  // Same precision as walletBalance. Never a float: 0.1 + 0.2 is not 0.3 in
  // binary floating point, and a lost cent per transfer is an accounting bug.
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ nullable: true })
  note: string | null;

  @Column({ default: 'pending' })
  status: PendingTransferStatus;

  @Column({ nullable: true })
  claimedByUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  /** After this, an unclaimed transfer can be refunded to the sender. */
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
