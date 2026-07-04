import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { AuditService } from './audit.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('admin/audit-logs')
  @ApiOperation({ summary: 'Read the sensitive-action audit trail (admin only)' })
  list(
    @Query('action') action?: string,
    @Query('actorUserId') actorRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const actorUserId = actorRaw ? parseInt(actorRaw, 10) : undefined;
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.audit.list({
      action,
      actorUserId: Number.isFinite(actorUserId) ? actorUserId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
