import { Controller, Get, Post, Body, Request, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SpamReportService, SpamReportDto } from './spam-report.service';

@ApiTags('spam-reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('spam-reports')
export class SpamReportController {
  constructor(private readonly service: SpamReportService) {}

  @Post()
  @ApiOperation({ summary: 'Contribute a hashed spam fingerprint (no plaintext PII)' })
  report(@Request() req, @Body() body: SpamReportDto) {
    return this.service.report(req.user.userId, body);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Recent aggregated spam fingerprints' })
  recent(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.getRecent(Number.isFinite(limit) ? limit : undefined);
  }
}
