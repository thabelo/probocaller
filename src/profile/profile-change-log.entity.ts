import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { ChangeKind } from './profile-diff';

/**
 * One field on one person's profile, moving.
 *
 * A profile holds the current state; this holds the trajectory, and the
 * trajectory says more. "Household went 2 → 3 in March" and "income band rose
 * twice this year" are life events, not attributes, and nobody handed them
 * over as such. So this table is ADMIN-ONLY and ages out — see the retention
 * purge — and it must never become a targeting signal without its own consent:
 * a business filtering on "recently had a child" is a different product from
 * one filtering on "has children", and only the second was agreed to.
 *
 * Its own table rather than an `audit_logs` row because the questions asked of
 * it are aggregate — how many changes did this person make this week, who
 * moved most this month — and `audit_logs.metadata` is a TEXT blob that no
 * index can reach into.
 */
@Entity('profile_change_logs')
// The two access patterns: one person's history, and everyone's over a range.
@Index(['userId', 'changedAt'])
@Index(['changedAt'])
export class ProfileChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** Whose profile changed. */
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Who made the change — the person themselves, or an admin acting for them.
   * Null for a system or migration-driven change, which is honest: nobody
   * decided it.
   */
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  /** The profile field key, e.g. `household_size`. */
  @Column({ type: 'varchar', length: 64 })
  fieldKey: string;

  /** Null when the field had no value before this. */
  @Column({ type: 'text', nullable: true })
  oldValue: string | null;

  /** Null when the field was emptied. */
  @Column({ type: 'text', nullable: true })
  newValue: string | null;

  @Column({ type: 'varchar', length: 16 })
  changeKind: ChangeKind;

  @CreateDateColumn()
  changedAt: Date;
}
