import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { QuestionType } from './question-type';

/** One question in a template — the shape a survey question is created from. */
export interface TemplateQuestion {
  type: QuestionType;
  prompt: string;
  options?: string[];
  required?: boolean;
}

/**
 * A curated starting point in the admin-managed library (surveys-spec §3.1),
 * e.g. "Insurance NPS" or "Product feedback". Adding one is a DATA change, not
 * a release — the same rule the marketplace catalogue follows.
 *
 * A business builds from a COPY: template questions are duplicated into
 * `survey_questions` at creation, so editing a template can never alter a
 * survey already published against it. Whether a business may save its OWN
 * template is deferred (§3.1) — the curated library is enough for launch.
 */
@Entity('survey_templates')
@Index(['key'], { unique: true })
export class SurveyTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  /** Stable identifier, e.g. 'insurance-nps'. */
  @Column()
  key: string;

  @Column()
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** Reporting label the created survey inherits (§3.2), not a filter. */
  @Column({ type: 'varchar', length: 64, default: '' })
  category: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questionsJson: TemplateQuestion[];

  /** Retired templates are hidden, never deleted — surveys trace back to them. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
