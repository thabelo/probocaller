import { Controller, Get, Post, Put, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { DataBrokerService } from './data-broker.service';
import { UpdatePrivacyPreferencesDto } from './dto/update-privacy-preferences.dto';
import { RequestCallPermissionDto } from './dto/request-call-permission.dto';

@ApiTags('data-broker')
@ApiBearerAuth()
@Controller('data-broker')
@UseGuards(AuthGuard('jwt'))
export class DataBrokerController {
  constructor(private readonly dataBrokerService: DataBrokerService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get your privacy & data-broker preferences' })
  getPreferences(@Request() req) {
    return this.dataBrokerService.getPreferences(req.user.userId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update your privacy & data-broker preferences' })
  updatePreferences(@Request() req, @Body() dto: UpdatePrivacyPreferencesDto) {
    return this.dataBrokerService.updatePreferences(req.user.userId, dto);
  }

  @Post('call-permission/request')
  @ApiOperation({ summary: 'Business: request permission to call a user' })
  requestPermission(@Request() req, @Body() dto: RequestCallPermissionDto) {
    return this.dataBrokerService.requestCallPermission(req.user.userId, dto);
  }

  @Get('call-permission/my-requests')
  @ApiOperation({ summary: 'Get all call permission requests targeting you' })
  getMyRequests(@Request() req) {
    return this.dataBrokerService.getMyRequests(req.user.userId);
  }

  @Put('call-permission/:id/approve')
  @ApiOperation({ summary: 'Approve a call permission request — optional freeWindow (24h/week/month) grants a free-call whitelist' })
  approve(@Request() req, @Param('id') id: number, @Body() body: { freeWindow?: '24h' | 'week' | 'month' }) {
    const WINDOWS: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    const freeWindowMs = body?.freeWindow ? WINDOWS[body.freeWindow] : undefined;
    return this.dataBrokerService.respondToRequest(req.user.userId, Number(id), true, freeWindowMs);
  }

  @Put('call-permission/:id/reject')
  @ApiOperation({ summary: 'Reject or revoke a call permission request' })
  reject(@Request() req, @Param('id') id: number) {
    return this.dataBrokerService.respondToRequest(req.user.userId, Number(id), false);
  }

  @Put('call-permission/:id/revoke')
  @ApiOperation({ summary: 'Revoke a previously approved permission' })
  revoke(@Request() req, @Param('id') id: number) {
    return this.dataBrokerService.revokePermission(req.user.userId, Number(id));
  }

  @Get('call-permission/approved-callers')
  @ApiOperation({ summary: 'List all businesses approved to call you' })
  getApprovedCallers(@Request() req) {
    return this.dataBrokerService.getApprovedCallers(req.user.userId);
  }

  @Get('call-permission/business-requests')
  @ApiOperation({ summary: 'Business: see all your call permission requests' })
  getBusinessRequests(@Request() req) {
    return this.dataBrokerService.getBusinessRequests(req.user.userId);
  }

  @Get('admin/all-requests')
  @ApiOperation({ summary: 'Admin: view all call permission requests' })
  adminAllRequests(@Request() req) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    return this.dataBrokerService.adminGetAllRequests();
  }
}
