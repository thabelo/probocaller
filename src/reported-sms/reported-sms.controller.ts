import { Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { ReportedSmsService, ReportDto, UpdateStatusDto } from './reported-sms.service';
import { ReportStatus } from './reported-sms.entity';

@ApiTags('reported-sms')
@ApiBearerAuth()
@Controller()
export class ReportedSmsController {
  constructor(private readonly service: ReportedSmsService) {}

  // ─── User: file a report ─────────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('reported-sms')
  @ApiOperation({ summary: 'Report an SMS for admin review' })
  report(@Request() req, @Body() body: ReportDto) {
    return this.service.report(req.user.userId, body);
  }

  // ─── Admin: list reports ─────────────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Get('admin/reported-sms')
  @ApiOperation({ summary: 'List reported SMS for admin review' })
  listForAdmin(
    @Query('status') status?: ReportStatus,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.listForAdmin({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  // ─── Admin: change review status ─────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Patch('admin/reported-sms/:id')
  @ApiOperation({ summary: 'Update review status / admin notes' })
  async updateStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStatusDto,
  ) {
    await this.service.updateStatus(req.user.userId, id, body);
    return { ok: true };
  }
}
