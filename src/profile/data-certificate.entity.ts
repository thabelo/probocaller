import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Business } from '../business/business.entity';

/**
 * A data-usage certificate issued to a business when it purchases lead data for
 * a period. Its public `code` can be validated by anyone to confirm the business
 * was (or is) authorised to use the covered numbers during [periodStart, periodEnd].
 * Holding at least one certificate is what unlocks the business's Leads view.
 */
@Entity('data_certificates')
export class DataCertificate {
  @PrimaryGeneratedColumn()
  id: number;

  // Public, human-shareable validation id, e.g. 'PC-3F9K-27A1'.
  @Index('IDX_data_certificates_code', { unique: true })
  @Column()
  code: string;

  @Column()
  businessId: number;

  // Snapshot of the business name at issue time (certs stay legible even if the
  // business is later renamed).
  @Column({ default: '' })
  businessName: string;

  // The authorisation window this certificate attests to.
  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  @Column({ type: 'int', default: 0 })
  leadCount: number;

  // The user ids covered by this certificate (the purchased leads).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  userIds: number[];

  @Column({ nullable: true })
  purpose: string | null;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @CreateDateColumn()
  issuedAt: Date;
}
