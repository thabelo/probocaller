import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Business } from '../../business/business.entity';
import { KybDocument } from './kyb-document.entity';

export type KybStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected';

@Entity('kyb_submissions')
export class KybSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ length: 2 })
  countryCode: string;

  // draft → pending (all required docs uploaded) → under_review → approved | rejected
  @Column({ default: 'draft' })
  status: KybStatus;

  // Country-specific business info fields (legal name, reg number, tax ID, address, etc.)
  @Column({ type: 'jsonb' })
  businessInfo: Record<string, any>;

  @Column({ nullable: true })
  reviewedBy: number;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  @Column({ nullable: true, type: 'text' })
  reviewerNotes: string;

  @Column({ nullable: true, type: 'timestamp' })
  reviewedAt: Date;

  @OneToMany(() => KybDocument, (d) => d.submission, { cascade: true, eager: false })
  documents: KybDocument[];

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
