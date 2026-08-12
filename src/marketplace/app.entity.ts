import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AppAudience, AppStatus } from './marketplace.service';

/**
 * A marketplace app.
 *
 * The catalogue is admin-managed, so releasing an app is a status change rather
 * than an app-store submission. The screens themselves ship in the binary —
 * `minAppVersion` exists so the storefront can hide an app from clients too old
 * to render it.
 *
 * An app has exactly one audience. Two-sided products (Databroker/Audience &
 * Leads, Surveys/Survey Campaigns) are two rows linked by `pairedAppKey`.
 */
@Entity('apps')
export class App {
  @PrimaryGeneratedColumn()
  id: number;

  /** Stable identifier the code depends on, e.g. 'data-broker'. */
  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ default: '' })
  tagline: string;

  /** Heroicons outline component name, resolved by the client. */
  @Column({ default: '' })
  icon: string;

  @Column({ default: '' })
  category: string;

  @Column({ default: 'user' })
  audience: AppAudience;

  @Column({ default: 'coming_soon' })
  status: AppStatus;

  /** Gate for apps that expose other users' data. */
  @Column({ default: false })
  requiresKyb: boolean;

  /**
   * Free at launch. Present from the start so charging later is a data change
   * rather than a migration on a live table.
   */
  @Column({ default: 'free' })
  pricingModel: string;

  @Column({ type: 'integer', nullable: true })
  priceCents: number | null;

  /** Client build below this cannot render the app; hidden rather than broken. */
  @Column({ type: 'varchar', nullable: true })
  minAppVersion: string | null;

  /** The other half of a two-sided product, for admin and analytics only. */
  @Column({ type: 'varchar', nullable: true })
  pairedAppKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
