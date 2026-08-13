import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppInstall } from './app-install.entity';
import { App } from './app.entity';
import { User } from '../user/user.entity';

/** Who an app is for. An app has exactly one audience. */
export type AppAudience = 'user' | 'business';

/** Catalogue lifecycle. Only 'live' apps can be installed. */
export type AppStatus = 'live' | 'beta' | 'coming_soon' | 'retired';

/** Runtime copy of AppStatus, so an admin's input can be validated against it. */
export const APP_STATUSES: AppStatus[] = ['live', 'beta', 'coming_soon', 'retired'];

/**
 * What an admin may edit. `key` is absent deliberately — the client switches on
 * it to find an app's screens, so renaming one would orphan a shipped feature.
 */
export const EDITABLE_APP_FIELDS = [
  'name',
  'tagline',
  'icon',
  'category',
  'status',
  'requiresKyb',
  'minAppVersion',
] as const;

/** One person's relationship with an app, for the admin drill-down. */
export interface AppInstallerRow {
  userId: number;
  name: string | null;
  phoneNumber: string | null;
  installedAt: Date;
  uninstalledAt: Date | null;
}

/** What a user may currently do with an app. */
export type AppState =
  | 'available'
  | 'installed'
  | 'needs_business'
  | 'needs_verification'
  | 'coming_soon';

/** The catalogue fields that decide access. */
export interface AppAccessFields {
  key: string;
  audience: AppAudience;
  status: AppStatus;
  requiresKyb: boolean;
}

/** The user facts that decide access. */
export interface UserAccessContext {
  hasBusinessAccess: boolean;
  kybVerified: boolean;
}

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(AppInstall)
    private readonly installRepo: Repository<AppInstall>,
    @InjectRepository(App)
    private readonly appRepo: Repository<App>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * App-specific consequences of turning an app on or off.
   *
   * Databroker's install IS the data-sharing consent, so the install row and
   * `dataShareEnabled` must never disagree — otherwise a removed app keeps
   * feeding audience queries, which already filter on that flag. The flag stays
   * independently toggleable inside the app, which is what makes "installed but
   * paused" a state distinct from withdrawing consent.
   */
  private async applyAppEffects(
    userId: number,
    appKey: string,
    active: boolean,
  ): Promise<void> {
    if (appKey === 'data-broker') {
      await this.userRepo.update(userId, { dataShareEnabled: active } as any);
    }
  }

  appState(
    app: AppAccessFields,
    ctx: UserAccessContext,
    installed: boolean,
  ): AppState {
    if (app.status !== 'live') {
      return 'coming_soon';
    }
    if (app.audience === 'business' && !ctx.hasBusinessAccess) {
      return 'needs_business';
    }
    if (app.requiresKyb && !ctx.kybVerified) {
      return 'needs_verification';
    }
    return installed ? 'installed' : 'available';
  }

  canUseApp(
    app: AppAccessFields,
    ctx: UserAccessContext,
    installed: boolean,
  ): boolean {
    return this.appState(app, ctx, installed) === 'installed';
  }

  async hasApp(userId: number, appKey: string): Promise<boolean> {
    const install = await this.installRepo.findOne({
      where: { userId, appKey, uninstalledAt: IsNull() },
    });
    return !!install;
  }

  /** Catalogue rows the client can render, each annotated with its state. */
  async listApps(
    userId: number,
    ctx: UserAccessContext,
  ): Promise<Array<App & { state: AppState }>> {
    const apps = await this.appRepo.find();
    const installed = await this.installedKeys(userId);

    return apps
      .filter((app) => app.status !== 'retired')
      .map((app) => ({
        ...app,
        state: this.appState(app, ctx, installed.has(app.key)),
      }));
  }

  /**
   * The whole catalogue, for admins. Unlike `listApps` this keeps retired apps
   * and resolves no per-user state — an admin is managing the catalogue, not
   * shopping in it, and needs to see the rows the storefront deliberately hides.
   */
  async listAllApps(): Promise<App[]> {
    return this.appRepo.find();
  }

  /**
   * The catalogue with uptake, for the admin table.
   *
   * Counts are aggregated in one grouped query rather than per app, so adding
   * apps doesn't add round trips. An app nobody has installed reports zero
   * rather than being absent — a missing number in an admin table is
   * indistinguishable from a broken query.
   */
  async listAppsForAdmin(): Promise<
    Array<App & { activeInstalls: number; totalInstalls: number }>
  > {
    const apps = await this.appRepo.find();

    const rows = await this.installRepo
      .createQueryBuilder('i')
      .select('i.appKey', 'appKey')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE i.uninstalledAt IS NULL)', 'active')
      .groupBy('i.appKey')
      .getRawMany();

    const byKey = new Map(rows.map((r: any) => [r.appKey, r]));

    return apps.map((app) => ({
      ...app,
      activeInstalls: Number(byKey.get(app.key)?.active ?? 0),
      totalInstalls: Number(byKey.get(app.key)?.total ?? 0),
    }));
  }

  /**
   * Who has an app, newest first.
   *
   * Revoked rows are included and flagged rather than hidden: uninstall is a
   * soft revoke, and for Databroker the install row IS the record of
   * data-sharing consent, so the history is the point.
   */
  async listAppInstalls(
    appKey: string,
    limit = 50,
    offset = 0,
  ): Promise<{ total: number; rows: AppInstallerRow[] }> {
    const app = await this.appRepo.findOne({ where: { key: appKey } });
    if (!app) throw new NotFoundException(`Unknown app: ${appKey}`);

    const [installs, total] = await this.installRepo.findAndCount({
      where: { appKey },
      order: { installedAt: 'DESC' },
      take: Math.min(limit, 200),
      skip: offset,
    });

    const users = await this.userRepo.findByIds(installs.map((i) => i.userId));
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      rows: installs.map((i) => ({
        userId: i.userId,
        name: byId.get(i.userId)?.name ?? null,
        phoneNumber: byId.get(i.userId)?.phoneNumber ?? null,
        installedAt: i.installedAt,
        uninstalledAt: i.uninstalledAt,
      })),
    };
  }

  /**
   * Edit a catalogue entry.
   *
   * Edit-only by design: an app row is inert without screens shipped in the
   * mobile binary, so there is no create, and withdrawing an app is
   * `status: 'retired'` rather than a delete that would orphan its installs.
   * `key` is excluded because it is what the client switches on to find an
   * app's screens — renaming one would silently orphan a shipped feature.
   */
  async updateApp(
    key: string,
    changes: Partial<
      Pick<
        App,
        | 'name'
        | 'tagline'
        | 'icon'
        | 'category'
        | 'status'
        | 'requiresKyb'
        | 'minAppVersion'
      >
    >,
  ): Promise<App> {
    const app = await this.appRepo.findOne({ where: { key } });
    if (!app) throw new NotFoundException(`Unknown app: ${key}`);

    if (changes.status !== undefined && !APP_STATUSES.includes(changes.status)) {
      throw new BadRequestException(
        `Unknown status: ${changes.status}. Expected one of ${APP_STATUSES.join(', ')}`,
      );
    }

    for (const field of EDITABLE_APP_FIELDS) {
      if (changes[field] !== undefined) (app as any)[field] = changes[field];
    }

    return this.appRepo.save(app);
  }

  /** Active install keys for a user, as a set for cheap membership tests. */
  async installedKeys(userId: number): Promise<Set<string>> {
    const rows = await this.installRepo.find({
      where: { userId, uninstalledAt: IsNull() },
    });
    return new Set(rows.map((r) => r.appKey));
  }

  /**
   * Install with the eligibility check re-derived server-side. The storefront
   * can be bypassed, so "available" has to be proven here, not asserted by the
   * caller.
   */
  async installApp(
    userId: number,
    appKey: string,
    ctx: UserAccessContext,
  ): Promise<AppInstall> {
    const app = await this.appRepo.findOne({ where: { key: appKey } });
    if (!app) throw new NotFoundException(`Unknown app: ${appKey}`);

    const state = this.appState(app, ctx, false);
    if (state !== 'available') {
      throw new ForbiddenException(`${app.name || appKey} is not available to you`);
    }
    return this.install(userId, appKey);
  }

  async canAccess(
    userId: number,
    appKey: string,
    ctx: UserAccessContext,
  ): Promise<boolean> {
    const app = await this.appRepo.findOne({ where: { key: appKey } });
    if (!app) return false;

    const installed = await this.hasApp(userId, appKey);
    return this.canUseApp(app, ctx, installed);
  }

  /**
   * Idempotent. A dormant row is reactivated in place so the user's previous
   * settings survive a remove/reinstall cycle; only a user who has never had
   * the app gets a new row.
   */
  async install(userId: number, appKey: string): Promise<AppInstall> {
    const existing = await this.installRepo.findOne({
      where: { userId, appKey },
    });

    const row =
      existing ??
      this.installRepo.create({ userId, appKey, settingsJson: null });

    row.installedAt = new Date();
    row.uninstalledAt = null;
    const saved = await this.installRepo.save(row);
    await this.applyAppEffects(userId, appKey, true);
    return saved;
  }

  async uninstall(userId: number, appKey: string): Promise<void> {
    const active = await this.installRepo.findOne({
      where: { userId, appKey, uninstalledAt: IsNull() },
    });
    if (!active) return;

    active.uninstalledAt = new Date();
    await this.installRepo.save(active);
    await this.applyAppEffects(userId, appKey, false);
  }
}
