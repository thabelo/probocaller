import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type ScreeningAction = 'accept' | 'reject' | 'screen';

@Entity('call_screenings')
export class CallScreening {
  @PrimaryGeneratedColumn()
  id: number;

  // The user whose assistant screened the call.
  @Column()
  userId: number;

  @Column()
  callerNumber: string;

  // 'accept' | 'reject' | 'screen'
  @Column()
  action: string;

  // Transcript of the assistant<->caller exchange (when action was 'screen').
  @Column({ type: 'text', nullable: true, default: null })
  transcript: string | null;

  // Short assistant summary shown to the user.
  @Column({ type: 'text', nullable: true, default: null })
  summary: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
