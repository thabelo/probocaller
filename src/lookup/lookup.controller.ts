import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LookupService } from './lookup.service';

@ApiTags('lookup')
@Controller('lookup')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}

  /**
   * Public reputation check for a phone number.
   *
   * Returns sanitized status only — no PII (no name, email, ID, balance).
   * Rate-limited per-IP to prevent number enumeration / scraping of the user base.
   */
  @Get(':phoneNumber')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public phone number reputation lookup',
    description:
      'Returns the spam / verified-business / registered status of a phone number. ' +
      'Rate-limited to 10 requests per minute per IP.',
  })
  async lookup(@Param('phoneNumber') phoneNumber: string) {
    return this.lookupService.lookup(phoneNumber);
  }
}
