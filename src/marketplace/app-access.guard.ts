import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MarketplaceService } from './marketplace.service';
import { UserAccessContextService } from './user-access-context.service';

export const REQUIRES_APP = 'requires_app';

/**
 * Marks a route as belonging to a marketplace app. Pair with AppAccessGuard.
 *
 *   @RequiresApp('audience-leads')
 *   @Get('leads')
 */
export const RequiresApp = (appKey: string) => SetMetadata(REQUIRES_APP, appKey);

@Injectable()
export class AppAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly marketplace: MarketplaceService,
    private readonly context: UserAccessContextService,
  ) {}

  async canActivate(execContext: ExecutionContext): Promise<boolean> {
    const appKey = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_APP,
      [execContext.getHandler(), execContext.getClass()],
    );
    // Opt-in: routes that never declared an app are none of our business.
    if (!appKey) return true;

    const request = execContext.switchToHttp().getRequest();
    const userId = request?.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Authentication required for this app');
    }

    const ctx = await this.context.forUser(userId);
    const allowed = await this.marketplace.canAccess(userId, appKey, ctx);
    if (!allowed) {
      throw new ForbiddenException(`You do not have access to ${appKey}`);
    }
    return true;
  }
}
