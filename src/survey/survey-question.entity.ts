import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Survey } from './survey.entity';
import { QuestionType } from './question-type';

/**
 * One question on a survey.
 *
 * The type is the price (surveys-spec §1.1): a survey's price per response is
 * the sum of its questions' type rates, which is why `feeAtPublish` is stored
 * per question rather than recomputed. Recomputing would let an admin retuning
 * a rate change what an in-flight, already-escrowed survey owes.
 */
@Entity('survey_questions')
export class SurveyQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  surveyId: number;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surveyId' })
  survey: Survey;

  @Column({ type: 'varchar', length: 32 })
  type: QuestionType;

  @Column({ type: 'text' })
  prompt: string;

  /** Ordered explicitly — never rely on insertion order for display. */
  @Column({ type: 'int', default: 0 })
  position: number;

  /** Choices for multiple_choice / dropdown. Null for free_text and yes_no. */
  @Column({ type: 'jsonb', nullable: true })
  optionsJson: string[] | null;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  /**
   * The type's base fee at the moment the survey was published, frozen so a
   * later rate change cannot rewrite what this survey owes. Zero while the
   * survey is still a draft and nothing has been quoted.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  feeAtPublish: string;
}
