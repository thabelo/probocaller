import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { SmsLogService } from './sms-log.service';
import { QuerySmsLogsDto } from './dto/query-sms-logs.dto';

/**
 * Cross-user admin visibility into SMS activity across every user, with
 * filtering, pagination and aggregate stats. Distinct from the per-user route
 * (admin/users/:userId/sms-log). A single call returns the page rows, the total
 * matching count, and stats computed over the whole filtered set, so the admin
 * page fetches once.
 */
@ApiTags('admin-sms-logs')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/sms-logs')
export class AdminSmsLogsController {
  constructor(private readonly service: SmsLogService) {}

  @Get()
  @ApiOperation({ summary: '[admin] Cross-user SMS logs with filtering, pagination and stats' })
  async list(@Query() query: QuerySmsLogsDto) {
    const { data, total } = await this.service.findFiltered(query);
    const stats = await this.service.statsFor(query);
    return { data, total, stats };
  }
}
