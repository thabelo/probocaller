import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { SurveyResponse } from './survey-response.entity';
import { SurveyQuestion } from './survey-question.entity';

/**
 * One answer to one question, inside one response.
 *
 * Two value columns rather than one: free text, yes/no and a single choice are
 * a single value, while a multi-select is several. Whether multiple choice is
 * single- or multi-select is still open (surveys-spec §3.1), and settling it
 * later must not mean migrating live answers.
 *
 * Answers reach a business anonymously — this row deliberately holds no
 * identity; the respondent is only reachable via the response's `userId`,
 * which no endpoint may expose (§2.1).
 */
@Entity('survey_answers')
@Index(['responseId', 'questionId'], { unique: true })
export class SurveyAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  responseId: number;

  @ManyToOne(() => SurveyResponse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'responseId' })
  response: SurveyResponse;

  @Column()
  questionId: number;

  @ManyToOne(() => SurveyQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: SurveyQuestion;

  /** Single-value answers: free text, yes/no, one chosen option. */
  @Column({ type: 'text', nullable: true })
  valueText: string | null;

  /** Multi-value answers, e.g. a multi-select. */
  @Column({ type: 'jsonb', nullable: true })
  valueJson: unknown | null;
}
