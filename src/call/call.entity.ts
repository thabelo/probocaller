import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';

@Entity('call_logs')
export class CallLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fromUserId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  @Column()
  toUserId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'toUserId' })
  toUser: User;

  // ─── Per-business attribution (captured at call time; null for personal /
  // legacy calls). Links are nulled — never cascade-deleted — so history
  // survives a business or number being removed. ───────────────────────────────
  @Index()
  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  @ManyToOne(() => Business, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'businessId' })
  business: Business | null;

  @Column({ type: 'int', nullable: true })
  callingNumberId: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  campaignId: number | null;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  platformCut: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  userEarnings: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0.002 })
  ratePerSecond: number;

  // 'initiated' | 'completed' | 'missed' | 'blocked'
  @Column({ default: 'initiated' })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  blockedReason: string | null;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  completedAt: Date;
}
