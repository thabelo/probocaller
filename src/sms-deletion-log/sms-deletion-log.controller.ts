import { Controller, Get, Post, Delete, Body, Request, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SmsDeletionLogService, LogDeletionDto } from './sms-deletion-log.service';

@ApiTags('sms-deletion-logs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('sms-deletion-logs')
export class SmsDeletionLogController {
  constructor(private readonly service: SmsDeletionLogService) {}

  @Get()
  @ApiOperation({ summary: 'List my SMS deletion log entries (reverse chronological)' })
  getAll(@Request() req, @Query('limit') limitRaw?: string) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.getAll(req.user.userId, Number.isFinite(limit) ? limit : undefined);
  }

  @Post()
  @ApiOperation({ summary: 'Record an SMS deletion event' })
  log(@Request() req, @Body() body: LogDeletionDto) {
    return this.service.log(req.user.userId, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all my deletion log entries' })
  async clear(@Request() req) {
    await this.service.clear(req.user.userId);
  }
}
