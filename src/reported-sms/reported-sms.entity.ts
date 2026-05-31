import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../user/user.entity';

export type ReportStatus = 'pending' | 'confirmed' | 'dismissed';
export type ReportReason = 'spam' | 'scam' | 'phishing' | 'harassment' | 'other';

@Entity('reported_sms')
@Index(['status', 'createdAt'])
@Index(['reporterUserId', 'createdAt'])
export class ReportedSms {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reporterUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterUserId' })
  reporter: User;

  // Sender of the offending SMS (the person being reported).
  @Column()
  sender: string;

  // Full body of the reported SMS — stored with explicit user consent.
  @Column({ type: 'text' })
  body: string;

  @Column()
  reason: ReportReason;

  @Column({ type: 'text', nullable: true })
  userNote: string;

  @Column({ default: 'pending' })
  status: ReportStatus;

  @Column({ nullable: true })
  reviewedBy: number;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'text', nullable: true })
  adminNotes: string;

  @CreateDateColumn()
  createdAt: Date;
}
