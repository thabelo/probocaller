import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ScamKeywordService } from './scam-keyword.service';

/**
 * Device-sync endpoint for the GLOBAL admin-managed scam keyword list.
 * Mobile merges this with on-device hardcoded defaults and the user's own
 * BlockedKeyword list. The `{ keywords: string[] }` response shape is a
 * fixed contract — do not change without coordinating with mobile.
 */
@ApiTags('scam-keywords')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('scam-keywords')
export class ScamKeywordController {
  constructor(private readonly service: ScamKeywordService) {}

  @Get('sync')
  @ApiOperation({ summary: 'Sync active global scam keywords for on-device SMS detection' })
  async sync(): Promise<{ keywords: string[] }> {
    const keywords = await this.service.getActiveKeywords();
    return { keywords };
  }
}
