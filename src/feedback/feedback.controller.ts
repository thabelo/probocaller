import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { FeedbackService, SubmitFeedbackDto } from './feedback.service';
import { FeedbackStatus } from './feedback.entity';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller()
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  // ─── User: submit feedback / bug report ──────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('feedback')
  @ApiOperation({ summary: 'Submit in-app feedback or a bug report' })
  submit(@Request() req, @Body() body: SubmitFeedbackDto) {
    return this.service.submit(req.user.userId, body);
  }

  // ─── Admin: list feedback ────────────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Get('admin/feedback')
  @ApiOperation({ summary: 'List submitted feedback for admin review' })
  listForAdmin(
    @Query('status') status?: FeedbackStatus,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.listForAdmin({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
