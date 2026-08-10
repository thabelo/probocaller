import { Controller, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { SmsLogService } from './sms-log.service';

/** Admin visibility into a specific user's SMS activity log. */
@ApiTags('admin-sms-log')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/users/:userId/sms-log')
export class AdminSmsLogController {
  constructor(private readonly service: SmsLogService) {}

  @Get()
  @ApiOperation({ summary: "[admin] List a user's SMS activity log entries, newest first" })
  list(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findAllForUser(userId);
  }
}
