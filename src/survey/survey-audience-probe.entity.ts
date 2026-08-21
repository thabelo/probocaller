import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';
import { SurveyFilters } from './survey.entity';

/**
 * One "how many people match this?" question, and what it was told.
 *
 * The audience estimate is the only number a business can ask for repeatedly,
 * for free, without publishing anything or anybody answering — which makes it
 * the cheapest way to probe who exists. Banding the answer stops a one-person
 * difference being readable; this table is what makes a CAMPAIGN of probes
 * visible after the fact.
 *
 * It is a detective control, deliberately. Blocking probing outright would
 * break the shortfall warning the builder depends on, and rate limits alone
 * only slow a patient attacker down. A business narrowing the same filter
 * forty times in an afternoon leaves forty rows here.
 *
 * Stores the BAND, never the exact count: a log holding the real numbers would
 * rebuild the very oracle the banding closes, for anyone who could read it.
 */
@Entity('survey_audience_probes')
export class SurveyAudienceProbe {
  @PrimaryGeneratedColumn()
  id: number;

  /** The caller. Present even when no business is resolved yet. */
  @Index()
  @Column()
  userId: number;

  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filtersJson: SurveyFilters;

  @Column({ type: 'varchar', length: 16 })
  band: string;

  @CreateDateColumn()
  probedAt: Date;
}
