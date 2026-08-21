import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * One suggestion the analyser drew from a consented user's SMS content.
 *
 * A SUGGESTION, never a change: a profile-field row waits for the user to
 * confirm it, a survey-question row waits for an admin to approve it. Status
 * carries that lifecycle.
 *
 * It deliberately stores only the STRUCTURED result and a short evidence label
 * — never the SMS text. The raw message reaches the analyser and is dropped;
 * keeping narrative the user did not hand over, to justify a guess, would give
 * the guess a worse privacy cost than the profile field it feeds.
 */
export type SmsInsightKind = 'profile_field' | 'survey_question';
export type SmsInsightStatus = 'pending' | 'applied' | 'dismissed';

@Entity('sms_insights')
@Index(['userId', 'status'])
export class SmsInsight {
  @PrimaryGeneratedColumn()
  id: number;

  /** Whose SMS produced it. */
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 24 })
  kind: SmsInsightKind;

  /** For a profile_field suggestion: the field and the value to propose. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  fieldKey: string | null;

  @Column({ type: 'text', nullable: true })
  suggestedValue: string | null;

  /** For a survey_question suggestion: the question to propose. */
  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  questionType: string | null;

  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0 })
  confidence: string;

  /** A short reason, never the raw SMS. */
  @Column({ type: 'text', default: '' })
  evidence: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: SmsInsightStatus;

  @CreateDateColumn()
  createdAt: Date;
}
