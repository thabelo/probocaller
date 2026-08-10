import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessWhitelistService } from './business-whitelist.service';

/**
 * Device-sync endpoint for the GLOBAL admin-managed business number
 * whitelist. Mobile uses this natively to bypass call-screening/spam
 * blocking for trusted/verified business numbers. The
 * `{ numbers: string[] }` response shape is a fixed contract — do not
 * change without coordinating with mobile.
 */
@ApiTags('business-whitelist')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('business-whitelist')
export class BusinessWhitelistController {
  constructor(private readonly service: BusinessWhitelistService) {}

  @Get('sync')
  @ApiOperation({ summary: 'Sync active global whitelisted business numbers for on-device call screening bypass' })
  async sync(): Promise<{ numbers: string[] }> {
    const numbers = await this.service.getActiveNumbers();
    return { numbers };
  }
}
