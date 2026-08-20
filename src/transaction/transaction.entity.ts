import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  // CREDIT_ADDED | CALL_CHARGE | CALL_EARN | SMS_CHARGE | SMS_EARN | ADMIN_CREDIT | ADMIN_DEBIT | DATA_PURCHASE | DATA_EARN | REFERRAL_COMMISSION | AD_REVENUE_SHARE
  @Column()
  type: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'int', nullable: true, default: null })
  callId: number;

  // Set when the money moved through a BUSINESS wallet (not the user's own
  // balance) — scopes the per-business ledger.
  @Column({ type: 'int', nullable: true, default: null })
  businessId: number;

  @Column({ nullable: true })
  reference: string;

  @CreateDateColumn()
  createdAt: Date;
}
