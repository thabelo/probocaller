import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

/**
 * A user's installation of a marketplace app.
 *
 * Uninstalling sets `uninstalledAt` rather than deleting the row, so consent
 * history stays auditable and a reinstall can restore `settingsJson`. Code that
 * asks "does this user have app X?" must therefore filter on
 * `uninstalledAt IS NULL` — the row's existence alone means nothing.
 */
@Entity('app_installs')
// Unique over *active* installs only, so a user can reinstall an app they
// removed without colliding with the revoked row. Mirrors the partial index the
// migration creates — keep the two in step, or a `synchronize` schema loses the
// guarantee that production enforces.
@Index(['userId', 'appKey'], { unique: true, where: '"uninstalledAt" IS NULL' })
export class AppInstall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Catalogue key, e.g. 'data-broker'. Not an FK — the catalogue is seeded. */
  @Column()
  appKey: string;

  @Column({ type: 'timestamp' })
  installedAt: Date;

  /** Null while the install is active; set when the user removes the app. */
  @Column({ type: 'timestamp', nullable: true })
  uninstalledAt: Date | null;

  /** Per-app user settings, preserved across an uninstall/reinstall cycle. */
  @Column({ type: 'jsonb', nullable: true })
  settingsJson: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
