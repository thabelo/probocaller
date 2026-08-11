import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReferralService } from './referral.service';

/**
 * Public (no-auth) window onto the admin-configurable referral commission
 * rate. Every other reader of this number (GET /user/rate, admin config
 * screens) sits behind AuthGuard('jwt') or AdminGuard — this endpoint
 * intentionally has none, mirroring LegalController, so that static
 * marketing landing pages can show the real, live figure instead of a
 * "3%" baked into their copy at build time.
 *
 * Rate-limited per-IP like the app's other unguarded endpoints
 * (LookupController, SuppressionController) to discourage scraping/abuse.
 */
@ApiTags('referral')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('rate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public referral commission rate',
    description:
      'Returns the current admin-configured lifetime referral commission rate ' +
      '(e.g. 0.03 for 3%). Rate-limited to 10 requests per minute per IP.',
  })
  async rate(): Promise<{ commissionRate: number }> {
    return { commissionRate: await this.referralService.getCommissionRate() };
  }
}
