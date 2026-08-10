import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from './business.service';

/**
 * Device-sync endpoint for the global list of VERIFIED businesses' active
 * phone numbers. Mirrors the scam-keywords/business-whitelist sync pattern:
 * mobile caches this list to recognize "business" category SMS senders
 * locally without a network call per message. The `{ numbers: string[] }`
 * response shape is a fixed contract — do not change without coordinating
 * with mobile.
 */
@ApiTags('business-numbers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('business-numbers')
export class BusinessNumberSyncController {
  constructor(private readonly service: BusinessService) {}

  @Get('sync')
  @ApiOperation({ summary: 'Sync active phone numbers of every verified business for on-device SMS categorization' })
  async sync(): Promise<{ numbers: string[] }> {
    const numbers = await this.service.getVerifiedActiveNumbers();
    return { numbers };
  }
}
