import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('spam_reports')
@Index(['senderHash', 'createdAt'])
@Index(['bodyHash'])
export class SpamReport {
  @PrimaryGeneratedColumn()
  id: number;

  // Reporter (FK is intentionally NOT modelled — the spam DB is aggregated.
  // We keep userId only to rate-limit a single user spamming the table.)
  @Column()
  userId: number;

  // SHA-256 hex digest of the sender's phone number (lowercase, 64 chars).
  @Column({ length: 64 })
  senderHash: string;

  // SHA-256 hex digest of the SMS body (lowercase, 64 chars).
  @Column({ length: 64 })
  bodyHash: string;

  // The user's regex that flagged the message — useful aggregate signal.
  @Column()
  matchedPattern: string;

  @CreateDateColumn()
  createdAt: Date;
}
