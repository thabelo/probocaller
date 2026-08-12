import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppInstall } from './app-install.entity';
import { App } from './app.entity';

/** Who an app is for. An app has exactly one audience. */
export type AppAudience = 'user' | 'business';

/** Catalogue lifecycle. Only 'live' apps can be installed. */
export type AppStatus = 'live' | 'beta' | 'coming_soon' | 'retired';

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
  ) {}

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
    return this.installRepo.save(row);
  }

  async uninstall(userId: number, appKey: string): Promise<void> {
    const active = await this.installRepo.findOne({
      where: { userId, appKey, uninstalledAt: IsNull() },
    });
    if (!active) return;

    active.uninstalledAt = new Date();
    await this.installRepo.save(active);
  }
}
