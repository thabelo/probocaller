import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Global, admin-managed SMS scam keyword list. Distinct from
 * BlockedKeyword (per-user, src/blocked-keyword/) and from
 * DEFAULT_SCAM_KEYWORDS (hardcoded, used for server-side risk scoring in
 * src/scam-shield/). This table is synced down to mobile devices
 * (GET /scam-keywords/sync) and merged there with on-device defaults and
 * the user's own blocked keywords.
 */
@Entity('scam_keywords')
export class ScamKeyword {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  keyword: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
