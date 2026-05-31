import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ScamShieldService } from './scam-shield.service';

@ApiTags('scam-shield')
@Controller('scam-shield')
export class ScamShieldController {
  constructor(private readonly scamShieldService: ScamShieldService) {}

  /**
   * Real-time scam risk assessment for a phone number — a 0–100 score, a level
   * and the reasons behind it, so the app can warn the user before they answer.
   * Rate-limited per-IP like the lookup endpoint to prevent enumeration.
   */
  @Get(':phoneNumber')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Real-time scam risk assessment for a phone number',
    description:
      'Returns a 0–100 risk score, level (low/medium/high) and reasons, derived ' +
      'from crowd spam signals. Rate-limited to 10 requests per minute per IP.',
  })
  async assess(@Param('phoneNumber') phoneNumber: string) {
    return this.scamShieldService.assess(phoneNumber);
  }
}
