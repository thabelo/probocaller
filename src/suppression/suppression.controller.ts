import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SuppressionService } from './suppression.service';

export class UnlistNumberDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Public POPIA/GDPR opt-out. No authentication — a non-user must be able to
 * remove their own number. Rate-limited per IP to prevent abuse/enumeration.
 */
@ApiTags('suppression')
@Controller('suppression')
export class SuppressionController {
  constructor(private readonly service: SuppressionService) {}

  @Post('unlist')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Unlist a phone number (public opt-out)',
    description:
      'Records that this number must not be held or surfaced by Probocaller, and ' +
      'blocks it from being re-added by future community reports. Stores only a keyed hash.',
  })
  async unlist(@Body() dto: UnlistNumberDto) {
    return this.service.unlist(dto.phoneNumber, dto.reason);
  }

  @Get('status/:phoneNumber')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check whether a number is unlisted' })
  async status(@Param('phoneNumber') phoneNumber: string) {
    return { suppressed: await this.service.isSuppressed(phoneNumber) };
  }
}
