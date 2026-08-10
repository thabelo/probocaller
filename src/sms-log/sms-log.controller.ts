import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SmsLogService } from './sms-log.service';
import { CreateSmsLogDto } from './dto/create-sms-log.dto';

/**
 * Device-upload endpoint: mobile uploads one log entry per SMS it evaluates
 * against the user's SMS policy (or blocks via keyword matching). userId is
 * always taken from the authenticated request, never the client body.
 */
@ApiTags('sms-log')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('sms-log')
export class SmsLogController {
  constructor(private readonly service: SmsLogService) {}

  @Post()
  @ApiOperation({ summary: 'Upload an SMS activity log entry (hashed body only, never the message text)' })
  create(@Request() req, @Body() dto: CreateSmsLogDto) {
    return this.service.create(req.user.userId, dto);
  }
}
