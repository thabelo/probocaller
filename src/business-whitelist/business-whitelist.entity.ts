import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Global, admin-managed list of trusted/verified business phone numbers.
 * No per-user scoping — one shared table admins curate. Mobile devices sync
 * this list down (GET /business-whitelist/sync) and use it natively to
 * bypass call-screening/spam-blocking for whitelisted numbers.
 */
@Entity('whitelisted_numbers')
export class WhitelistedNumber {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  phoneNumber: string;

  @Column({ nullable: true })
  label: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
