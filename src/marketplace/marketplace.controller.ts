import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { UserAccessContextService } from './user-access-context.service';

/**
 * The app marketplace.
 *
 * The user is always taken from the JWT. Nothing here accepts a user id, so a
 * caller cannot install an app for someone else or read another user's
 * entitlements.
 */
@ApiTags('marketplace')
@Controller('marketplace')
@UseGuards(AuthGuard('jwt'))
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly context: UserAccessContextService,
  ) {}

  @Get('apps')
  @ApiOperation({ summary: 'The catalogue, annotated with this user\'s state per app' })
  async list(@Request() req: any) {
    const ctx = await this.context.forUser(req.user.userId);
    return this.marketplace.listApps(req.user.userId, ctx);
  }

  @Get('me/apps')
  @ApiOperation({ summary: 'Keys of the apps this user currently has installed' })
  async myApps(@Request() req: any) {
    const keys = await this.marketplace.installedKeys(req.user.userId);
    return { apps: [...keys] };
  }

  @Post('apps/:key/install')
  @ApiOperation({ summary: 'Install an app (eligibility is re-checked server-side)' })
  async install(@Request() req: any, @Param('key') key: string) {
    const ctx = await this.context.forUser(req.user.userId);
    return this.marketplace.installApp(req.user.userId, key, ctx);
  }

  @Delete('apps/:key/install')
  @ApiOperation({ summary: 'Remove an app — revokes access, keeps settings and history' })
  async uninstall(@Request() req: any, @Param('key') key: string) {
    await this.marketplace.uninstall(req.user.userId, key);
    return { removed: key };
  }
}
