import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Survey } from './survey.entity';
import { User } from '../user/user.entity';

/**
 * One person's run at one survey.
 *
 * `userId` is here for payment and de-duplication ONLY. No endpoint may return
 * it to a business (surveys-spec §2.1): a business sees answers plus the
 * demographic bands it targeted, never a name or a number. Treat that like
 * `dataShareEnabled` — enforced server-side, never client-side.
 *
 * Payment fires on submission, not per answer (§1.3), so an abandoned run
 * earns nothing and costs nothing.
 */
@Entity('survey_responses')
// One response per person per survey — in the DATABASE, because two concurrent
// submissions would both pass a check-then-insert and both draw from the pot.
@Index(['surveyId', 'userId'], { unique: true })
export class SurveyResponse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  surveyId: number;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surveyId' })
  survey: Survey;

  /** Never exposed to a business. Payment and de-duplication only. */
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  /** Null while in progress. Setting this is what triggers the payout. */
  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  /** Drawn from the survey's held pot on completion; 0 until submitted. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: string;
}
