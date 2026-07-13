import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AirtimeStatus = 'pending' | 'delivered' | 'failed';

/**
 * Airtime redemption lifecycle (fulfilled by an external airtime provider):
 *   pending    → created, wallet already debited ("reserved")
 *   pending    → delivered  (provider confirmed the top-up)
 *   pending    → failed     (provider rejected → wallet refunded)
 *
 * Unlike bank withdrawals (admin-approved), airtime is fulfilled in real time
 * by the provider, so the debit is refunded automatically on provider failure.
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

  /** Provider transaction reference once delivered. */
  @Column({ nullable: true, type: 'text' })
  providerRef: string;

  /** Reason string when status = failed. */
  @Column({ nullable: true, type: 'text' })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
