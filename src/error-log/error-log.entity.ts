import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type ErrorLogSource = 'mobile' | 'web' | 'server';
export type ErrorLogLevel = 'error' | 'warn' | 'fatal';

@Entity('error_logs')
@Index(['level', 'createdAt'])
@Index(['source', 'createdAt'])
export class ErrorLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  source: ErrorLogSource;

  @Column({ default: 'error' })
  level: ErrorLogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  stack: string;

  // Optional client context to help triage (screen, route, device…).
  @Column({ type: 'json', nullable: true })
  context: Record<string, unknown>;

  @Column({ nullable: true })
  appVersion: string;

  @Column({ nullable: true })
  platform: string;

  @CreateDateColumn()
  createdAt: Date;
}
