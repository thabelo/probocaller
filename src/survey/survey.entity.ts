import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Business } from '../business/business.entity';

export const SURVEY_STATUSES = ['draft', 'live', 'closed', 'expired'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

/**
 * Which respondents a survey is offered to (surveys-spec §3.2).
 *
 * Keyed by PROFILE FIELD KEY — the same fields Databroker already prices
 * (`age_range`, `province`, `industry_sector`, …) — mapping to the value, or
 * any of several values, that a respondent must hold. The spec is explicit
 * that these reuse the existing taxonomy rather than inventing a parallel one,
 * which matters most for age: users pick a BAND, so a survey targets bands and
 * never a number nobody stored.
 *
 * Stored as JSON because the field set is itself data (ProfileField rows), so
 * a new matchable field must not require a migration here.
 *
 * Matching additionally requires an ACTIVE `surveys` install: installing that
 * app IS the consent to be matched (§2.2). It is deliberately NOT keyed off
 * `dataShareEnabled` — removing Databroker must not silently stop survey
 * invitations, since no copy anywhere warns that it would.
 */
export type SurveyFilters = Record<string, string | string[]>;

/**
 * A survey a business publishes and pays for. See docs/product/surveys-spec.md.
 *
 * Money model (§1.2): publishing debits the business's wallet by
 * `pricePerResponse × targetResponses` and HOLDS it. Respondents are paid out
 * of that pot as they complete (§1.3); whatever is unspent is refunded when the
 * survey closes or expires. This is the only arrangement where a respondent who
 * finishes is always paid AND a business can never overspend.
 *
 * Privacy (§2.1): a business sees answers plus the demographic bands it
 * targeted, never an identity. Responses store `userId` for payment and
 * de-duplication, but no endpoint may return it — enforced server-side, the
 * same way `dataShareEnabled` is.
 */
@Entity('surveys')
export class Survey {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /**
   * What the survey is ABOUT / who is asking — a label for the respondent and
   * for reporting. Does not affect matching; that is `filtersJson` (§3.2).
   */
  @Column({ type: 'varchar', length: 64, default: '' })
  category: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: SurveyStatus;

  /** Who may answer. Empty object means anyone with the app installed. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filtersJson: SurveyFilters;

  /** How many completed responses are being bought; caps the escrow. */
  @Column({ type: 'int', default: 0 })
  targetResponses: number;

  // Whether this survey asks respondents for their phone number. Opt-in and
  // priced per response (SURVEY_FEE_PHONE_NUMBER) on top of the question fees,
  // so a business chooses the cost rather than inheriting it. Defaults false:
  // no existing survey starts paying for numbers it never asked for.
  @Column({ default: false })
  collectPhoneNumber: boolean;

  /**
   * Price of ONE completed response — the sum of the question type rates at
   * the moment of publish. Frozen deliberately: an admin retuning a rate later
   * must not change what an in-flight survey pays or what it owes back.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pricePerResponse: string;

  /** Debited from the wallet and held at publish: price × target. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalHeld: string;

  /** Paid out to respondents so far. The refund on close is held − paid. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPaid: string;

  /**
   * When the time limit runs out. Null = indefinite (§3.3) — then only meeting
   * the response target closes it.
   */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
