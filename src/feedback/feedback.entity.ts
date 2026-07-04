import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../user/user.entity';

export type FeedbackCategory = 'bug' | 'suggestion' | 'other';
export type FeedbackStatus = 'open' | 'reviewed' | 'closed';

@Entity('feedback')
@Index(['status', 'createdAt'])
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  category: FeedbackCategory;

  @Column({ type: 'text' })
  message: string;

  // Optional client context to help triage bug reports.
  @Column({ nullable: true })
  appVersion: string;

  @Column({ nullable: true })
  platform: string;

  @Column({ default: 'open' })
  status: FeedbackStatus;

  @CreateDateColumn()
  createdAt: Date;
}
