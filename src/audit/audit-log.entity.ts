import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['createdAt'])
@Index(['action'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  // Who performed the action. Null for system/automated events.
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  // What happened, e.g. 'admin.user.credit', 'gdpr.export', 'profile.access'.
  @Column()
  action: string;

  // What was acted on, e.g. 'user', 'profile', 'withdrawal'.
  @Column({ nullable: true })
  targetType: string;

  @Column({ nullable: true })
  targetId: string;

  // Free-form JSON context (serialized) — amounts, field names, etc.
  @Column({ type: 'text', nullable: true })
  metadata: string;

  @Column({ nullable: true })
  ip: string;

  @CreateDateColumn()
  createdAt: Date;
}
