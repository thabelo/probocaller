import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { InviteService, RecordInviteDto } from './invite.service';
import { InviteStatus } from './invite.entity';

@ApiTags('invite')
@ApiBearerAuth()
@Controller()
export class InviteController {
  constructor(private readonly service: InviteService) {}

  // ─── User: record an invite they just sent ───────────────────────────────
  // The inviter comes from the JWT, never the body — otherwise anyone could
  // post invites attributed to another user and farm their referral chain.
  @UseGuards(AuthGuard('jwt'))
  @Post('invite')
  @ApiOperation({ summary: 'Record an SMS invite sent to someone' })
  record(@Request() req, @Body() body: RecordInviteDto) {
    return this.service.record(req.user.userId, body);
  }

  // ─── Admin: list invites ─────────────────────────────────────────────────
  @UseGuards(AdminGuard)
  // NOT 'admin/invites' — that path already belongs to AdminInviteController,
  // which invites people to become ADMINS. Two controllers on one path means the
  // loser never fires, silently.
  @Get('admin/user-invites')
  @ApiOperation({ summary: 'List person-to-person invites for admin review' })
  listForAdmin(
    @Query('status') status?: InviteStatus,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.service.listForAdmin({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
