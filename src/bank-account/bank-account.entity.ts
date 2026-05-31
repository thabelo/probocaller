import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * One bank account per user.  Used to receive withdrawal payouts.  Kept as a
 * single row per user (unique index on userId) — the user can edit it via a
 * PUT, which upserts.  We intentionally don't store full account details
 * encrypted; the threat model here is "what the admin sees in the dashboard
 * for processing a manual payout", not "PCI-grade card vault".
 */
@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  userId: number;

  /**
   * ISO 3166-1 alpha-2 country code (e.g. "ZA", "US").  Drives the bank
   * picker's curated list — combined with bankName it forms the canonical
   * (country, bank) pair an admin needs to process a payout.
   */
  @Column({ length: 2, nullable: true })
  country: string;

  @Column()
  bankName: string;

  @Column()
  accountHolder: string;

  @Column()
  accountNumber: string;

  // 'cheque' | 'savings' | 'transmission'
  @Column({ default: 'cheque' })
  accountType: string;

  // South African branch code (optional, often universal for the bank)
  @Column({ nullable: true })
  branchCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
