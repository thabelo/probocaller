import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Per-user SMS activity log: one row per incoming SMS a device evaluates
 * against the user's SMS policy (src/data-broker/sms-policy.ts) or blocks via
 * keyword matching. The device computes an MD5 hash of the message body
 * locally and uploads only that hash — the message text itself never reaches
 * the server.
 */
@Entity('sms_logs')
@Index(['userId'])
export class SmsLog {
  @PrimaryGeneratedColumn()
  id: number;

  // The RECEIVING user. No relation decorator — this table only ever needs
  // the raw id, matching other per-user tables that are queried by userId
  // alone (e.g. ErrorLog/AuditLog's plain-column + index convention).
  @Column()
  userId: number;

  // The sender's phone number. Not message content.
  @Column()
  address: string;

  // MD5 hash (32 lowercase hex chars) of the message body, computed on-device.
  // The server never sees the plaintext SMS body.
  @Column()
  bodyHash: string;

  // 'contacts' | 'business' | 'newSender' | 'unknown'
  @Column()
  category: string;

  // 'free' | 'paid' | 'blocked'
  @Column()
  decision: string;

  // The scam keyword/pattern that matched this message, when the block was
  // driven by keyword matching. Null when no keyword matched (policy-only
  // blocks or allowed messages).
  @Column({ type: 'varchar', nullable: true })
  matchedKeyword: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
