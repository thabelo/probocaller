import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../admin/admin.guard';
import { ErrorLogService, RecordErrorDto } from './error-log.service';
import { ErrorLogLevel, ErrorLogSource } from './error-log.entity';

@ApiTags('error-log')
@Controller()
export class ErrorLogController {
  constructor(private readonly service: ErrorLogService) {}

  // ─── Clients: auto error reporting ───────────────────────────────────────
  // Public on purpose: crashes can happen before login. Throttled per-IP.
  @Post('error-logs')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Report a client-side error (auto error logging)' })
  report(@Body() body: RecordErrorDto) {
    return this.service.record(body);
  }

  // ─── Admin: browse error logs ────────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Get('admin/error-logs')
  @ApiOperation({ summary: 'List captured error logs for admin review' })
  listForAdmin(
    @Query('level') level?: ErrorLogLevel,
    @Query('source') source?: ErrorLogSource,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.list({
      level,
      source,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
