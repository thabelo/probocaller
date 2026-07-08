import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
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
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Buy filtered leads (metered against the business wallet)' })
  getLeads(@Request() req: any, @Body() dto: QueryAudienceDto) {
    return this.profileService.purchaseLeads(req.business.userId, dto);
  }
}
