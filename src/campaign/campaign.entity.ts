import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Business } from '../business/business.entity';

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** What the campaign runs: a promotional ad, or a survey that collects answers. */
export const CAMPAIGN_TYPES = ['ad', 'survey'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/** How it reaches people: inside the Probocaller app, or over calls/SMS. */
export const CAMPAIGN_CHANNELS = ['in_app', 'calls_sms'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/** One survey question. Free-text answers for now; typed answers can come later. */
export interface SurveyQuestion {
  text: string;
}

/**
 * An ad or survey a business runs: what it is (type), how it's delivered
 * (channel), who it targets (audience filters), its content (ad creative + CTA,
 * or survey questions), what it may spend, and where it is in its lifecycle.
 * It records intent and tracks spend — it does not deliver by itself.
 */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'ad' })
  type: CampaignType;

  @Column({ type: 'varchar', length: 16, default: 'in_app' })
  channel: CampaignChannel;

  /** Ad creative — the headline/message shown or spoken. Null for surveys. */
  @Column({ type: 'text', nullable: true })
  creative: string | null;

  /** Optional call-to-action link for an ad. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  ctaUrl: string | null;

  /** Ordered survey questions. Null for ads. */
  @Column({ type: 'simple-json', nullable: true })
  questions: SurveyQuestion[] | null;

  /** Audience filters, same shape as a saved audience's. */
  @Column({ type: 'simple-json', default: '{}' })
  filters: Record<string, { op: string; value: any }>;

  /** Optional provenance: the saved audience this was built from. */
  @Column({ type: 'int', nullable: true })
  audienceId: number | null;

  /** The business number this campaign dials from. Required before going active. */
  @Column({ type: 'int', nullable: true })
  callingNumberId: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  budget: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  spent: string;

  @Column({ type: 'int', default: 0 })
  leadsPurchased: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: CampaignStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
