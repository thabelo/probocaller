import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { FicaDocument } from './fica-document.entity';

export type FicaStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/**
 * FICA (SA personal KYC) submission.  One *active* submission per user at a
 * time — the service enforces "no second submission while a draft/pending one
 * is open".  Approved status unlocks withdrawals.
 */
@Entity('fica_submissions')
export class FicaSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ default: 'draft' })
  status: FicaStatus;

  /**
   * Country whose FICA document set this submission was created against
   * (see src/fica/fica-country-config.ts). Set once at creation and
   * immutable afterwards — the uploaded documents were validated against
   * this country's config, so letting it change later would let mismatched
   * documents count toward a different jurisdiction's requirements.
   */
  @Column({ default: 'ZA' })
  countryCode: string;

  @Column()
  fullName: string;

  /** SA ID number, or passport number for non-SA citizens. */
  @Column()
  idNumber: string;

  /** 'sa_id' | 'passport' */
  @Column({ default: 'sa_id' })
  idType: string;

  @Column({ type: 'text' })
  residentialAddress: string;

  @Column({ nullable: true })
  reviewedBy: number;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  @Column({ nullable: true, type: 'timestamp' })
  reviewedAt: Date;

  @Column({ nullable: true, type: 'timestamp' })
  submittedAt: Date;

  @OneToMany(() => FicaDocument, (doc) => doc.submission, { cascade: true })
  documents: FicaDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
