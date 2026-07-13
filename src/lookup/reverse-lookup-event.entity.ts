import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One reverse-lookup (Google Places) event. Written whenever we fall back to an
 * external provider for a number not in our own directory, so the admin dashboard
 * can show usage, cost and other stats. A cached hit is recorded with cost 0
 * (served from our own data — no external charge). Only the fact that a name was
 * returned is stored (`hasName`), never the name itself (provider ToS).
 */
@Entity('reverse_lookup_events')
export class ReverseLookupEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  phoneNumber: string;

  @Column({ default: 'google' })
  provider: string;

  /** true = served from our cache/DB (free); false = a real, billed provider call. */
  @Column({ default: false })
  cached: boolean;

  @Column({ type: 'varchar', nullable: true })
  lineType: string | null;

  /** Whether the provider returned a name (boolean only — the name is not stored). */
  @Column({ default: false })
  hasName: boolean;

  @Column({ default: true })
  success: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costUsd: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
