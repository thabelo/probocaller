import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from './admin.guard';
import { AdminInviteService, CreateInviteDto } from './admin-invite.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller()
export class AdminInviteController {
  constructor(private readonly service: AdminInviteService) {}

  // ─── Admin: invite a phone number to become an admin ─────────────────────
  @UseGuards(AdminGuard)
  @Post('admin/invites')
  @ApiOperation({ summary: 'Create an admin invite (returns a one-time token)' })
  create(@Request() req, @Body() body: CreateInviteDto) {
    return this.service.create(req.user.userId, body);
  }

  @UseGuards(AdminGuard)
  @Get('admin/invites')
  @ApiOperation({ summary: 'List admin invites' })
  list() {
    return this.service.list();
  }

  // ─── Invitee: redeem the invite to gain admin access ─────────────────────
  // Plain JWT auth — the redeeming user is not an admin yet; the service checks
  // their phone matches the invite and the token is valid.
  @UseGuards(AuthGuard('jwt'))
  @Post('admin/invites/redeem')
  @ApiOperation({ summary: 'Redeem an admin invite token' })
  async redeem(@Request() req, @Body() body: { token: string }) {
    const user = await this.service.redeem(body.token, req.user.userId);
    return { ok: true, role: user.role };
  }
}
