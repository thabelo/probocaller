import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // { fieldKey: value } — the actual submitted profile data
  @Column({ type: 'simple-json', default: '{}' })
  data: Record<string, any>;

  // { fieldKey: true } — fields verified (e.g. income via bank statement upload)
  @Column({ type: 'simple-json', default: '{}' })
  verifiedFields: Record<string, boolean>;

  // Weighted 0–100
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completionScore: number;

  /**
   * When we last asked this person whether anything had changed.
   *
   * The cooldown reads from here, and it is the difference between a nudge and
   * nagging: a profile that has been stale for two years is still only asked
   * about as often as the cooldown allows.
   */
  @Column({ type: 'timestamp', nullable: true })
  stalePromptedAt: Date | null;

  // 'basic' | 'silver' | 'gold' | 'platinum'
  @Column({ default: 'basic' })
  tier: string;

  // Per-field minimum earnings the user requires before sharing: { fieldKey: creditAmount }
  @Column({ type: 'simple-json', default: '{}' })
  floorPrices: Record<string, number>;

  @UpdateDateColumn()
  lastUpdated: Date;

  @CreateDateColumn()
  createdAt: Date;
}
