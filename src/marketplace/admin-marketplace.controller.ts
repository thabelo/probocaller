import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { App } from './app.entity';
import { MarketplaceService } from './marketplace.service';
import { UpdateAppDto } from './dto/update-app.dto';

/**
 * Admin catalogue management.
 *
 * Kept apart from MarketplaceController because the audience differs: this is
 * AdminGuard-only and returns raw catalogue rows, where the storefront returns
 * rows annotated with the calling user's state.
 *
 * There is no create and no delete. An app row is inert without screens shipped
 * in the mobile binary, and deleting one would orphan its installs — so
 * withdrawing an app is `status: 'retired'`.
 */
@ApiTags('admin')
@Controller('admin/marketplace')
@UseGuards(AdminGuard)
export class AdminMarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('apps')
  @ApiOperation({ summary: 'The whole catalogue with uptake, retired apps included' })
  async list() {
    return this.marketplace.listAppsForAdmin();
  }

  /**
   * Who has an app. Revoked installs are included and dated — for Databroker
   * the install row IS the record of data-sharing consent, so the withdrawal
   * history is the point rather than noise.
   */
  @Get('apps/:key/installs')
  @ApiOperation({ summary: 'Who installed an app, newest first' })
  async installs(
    @Param('key') key: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.marketplace.listAppInstalls(
      key,
      Number(limit) || 50,
      Number(offset) || 0,
    );
  }

  @Patch('apps/:key')
  @ApiOperation({ summary: "Edit an app's copy, status or gating" })
  async update(
    @Param('key') key: string,
    @Body() changes: UpdateAppDto,
  ): Promise<App> {
    return this.marketplace.updateApp(key, changes);
  }
}
