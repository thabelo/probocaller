import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { BusinessService } from './business.service';
import { ProfileService } from '../profile/profile.service';
import { QueryAudienceDto } from '../profile/dto/query-audience.dto';

/**
 * The public leads API. Businesses authenticate with their API key
 * (x-api-key header), filter by date and profile fields, and each call
 * values the returned data and debits it from the business wallet — crediting
 * each data owner and notifying them of the profit.
 */
@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly businessService: BusinessService,
  ) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Buy filtered leads (metered against the business wallet)' })
  async getLeads(@Request() req: any, @Body() dto: QueryAudienceDto) {
    const userId = req.business.userId;
    const scopes: string[] = req.apiKey?.scopes ?? [];
    // dryRun estimates the reach/cost via queryAudience WITHOUT billing — used
    // by the admin "Test" button so it never charges the wallet.
    if (dto.dryRun) {
      const estimate = await this.profileService.queryAudience(userId, dto, scopes);
      return { dryRun: true, scopes, ...estimate };
    }
    // Enforce the key's per-call spend cap so an automated call can't drain the
    // business wallet in one request.
    const spendCap = req.apiKey?.maxSpendPerCall != null ? Number(req.apiKey.maxSpendPerCall) : null;
    // Attribute the minted certificate to the key that made this purchase.
    const source = { apiKeyId: req.apiKey?.id ?? null, label: req.apiKey?.label ?? null };
    const result = await this.profileService.purchaseLeads(userId, dto, scopes, spendCap, source);
    await this.businessService.recordApiKeyUsage(req.apiKey.id, result.totalCost || 0);
    return result;
  }
}
