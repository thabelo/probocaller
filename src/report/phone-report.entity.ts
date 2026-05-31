import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('phone_reports')
export class PhoneReport {
  @PrimaryGeneratedColumn()
  id: number;

  /** Canonical E.164 format: +27123456789 */
  @Column({ unique: true })
  phone: string;

  /** ISO 3166-1 alpha-2 country code, e.g. "za" */
  @Column({ nullable: true })
  country: string;

  /** Dial code without +, e.g. "27" */
  @Column({ nullable: true })
  code: string;

  /** Local format, e.g. "0123456789" */
  @Column({ nullable: true })
  phoneLocal: string;

  /** Total number of spam/scam reports from the community */
  @Column({ default: 0 })
  spamReports: number;

  /**
   * Count of users who declined a call from this (unregistered) number and
   * indicated they suspected the caller was a business.  Distinct from
   * spamReports — being a likely unregistered business is a signal worth
   * surfacing to admins, but it's not the same as a spam/scam complaint.
   */
  @Column({ default: 0 })
  suspectedBusinessReports: number;

  /** Admin-marked: number belongs to a trusted verified business */
  @Column({ default: false })
  trustedBusiness: boolean;

  /** ISO date string of the most recent complaint, e.g. "2026-05-10" */
  @Column({ type: 'date', nullable: true })
  lastComplaint: string;

  /** Reason provided by the most recent reporter */
  @Column({ nullable: true })
  lastReason: string;

  /**
   * Aggregate risk score 0–100.
   * Recalculated on every new report:
   *   base = spamReports × 8  (capped at 80)
   *   +20 if globally marked spam
   *   −10 if trustedBusiness
   */
  @Column({ default: 0 })
  riskScore: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
