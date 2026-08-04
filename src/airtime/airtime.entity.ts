import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AirtimeStatus = 'pending' | 'delivered' | 'failed';

/**
 * Airtime redemption lifecycle (processed by a ProboCaller admin):
 *   pending    → created, wallet already debited ("reserved")
 *   pending    → delivered  (admin confirmed the manual top-up)
 *   pending    → failed     (admin rejected → wallet refunded)
 *
 * Requests are processed by a ProboCaller admin (same as bank withdrawals): the
 * wallet is debited when the request is queued, and an admin either confirms the
 * manual top-up or rejects it, which refunds the user.
 */
@Entity('airtime_payouts')
export class AirtimePayout {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  /** Amount redeemed, in the wallet/ZAR unit. */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  /** Recipient MSISDN the airtime is sent to (may differ from the user's own). */
  @Column()
  phoneNumber: string;

  /** SA mobile network code: VODACOM | MTN | CELLC | TELKOM. */
  @Column()
  network: string;

  @Column({ default: 'pending' })
  status: AirtimeStatus;

  /** Operator/receipt reference the admin records when confirming the top-up. */
  @Column({ nullable: true, type: 'text' })
  providerRef: string;

  /** Admin who resolved the request (delivered or rejected it). */
  @Column({ nullable: true })
  reviewedBy: number;

  @Column({ nullable: true, type: 'timestamp' })
  reviewedAt: Date;

  /** Reason string when status = failed. */
  @Column({ nullable: true, type: 'text' })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
