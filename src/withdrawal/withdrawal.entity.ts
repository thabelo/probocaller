import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type WithdrawalStatus = 'pending' | 'cancelled' | 'paid' | 'rejected';

/**
 * Withdrawal request lifecycle:
 *   pending → cancelled  (user cancels while still pending)
 *   pending → paid       (admin approves & marks paid)
 *   pending → rejected   (admin rejects with reason → wallet refunded)
 *
 * When created, we deduct the amount from the user's wallet ("on hold").
 * Cancellation and rejection both refund.  Paid finalises.
 */
@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ default: 'pending' })
  status: WithdrawalStatus;

  /** Snapshot of the bank account at the moment of request — survives later edits/deletes. */
  @Column({ type: 'jsonb' })
  bankAccountSnapshot: {
    country?: string | null;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    accountType: string;
    branchCode?: string | null;
  };

  @Column({ nullable: true })
  reviewedBy: number;

  @Column({ nullable: true, type: 'text' })
  adminNotes: string;

  @Column({ nullable: true, type: 'timestamp' })
  reviewedAt: Date;

  @Column({ nullable: true, type: 'timestamp' })
  cancelledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
