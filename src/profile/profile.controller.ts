import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, Request, ForbiddenException, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertProfileFieldDto } from './dto/upsert-profile-field.dto';
import { QueryAudienceDto, SaveAudienceDto } from './dto/query-audience.dto';
import { AdminUpdateDataBrokerDto } from './dto/admin-data-broker.dto';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // ─── Field definitions (public read) ─────────────────────────────────────

  @Get('fields')
  @ApiOperation({ summary: 'List all enabled profile fields' })
  getFields() {
    return this.profileService.getEnabledFields();
  }

  // ─── My profile ───────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get my profile data, completion score and tier' })
  getMyProfile(@Request() req) {
    return this.profileService.getMyProfile(req.user.userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update my profile data and/or floor prices' })
  updateMyProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateMyProfile(req.user.userId, dto);
  }

  // ─── Global data-subject rights (POPIA, GDPR, CCPA, LGPD, PIPEDA, DPDP …)

  @Get('access-log')
  @ApiOperation({ summary: 'Right of access — see who accessed your data and when (POPIA s.23, GDPR/UK GDPR Art. 15, CCPA §1798.110, LGPD Art. 18, PIPEDA, DPDP, PIPL, APPI, PDPA, NDPR & equivalents)' })
  getAccessLog(@Request() req) {
    return this.profileService.getMyAccessLog(req.user.userId);
  }

  @Delete('erase')
  @ApiOperation({ summary: 'Right to erasure / right to be forgotten — permanently delete all profile data and access logs (POPIA s.24, GDPR Art. 17, CCPA §1798.105, LGPD Art. 18, DPDP s.12, PIPL Art. 47 & equivalents)' })
  eraseData(@Request() req) {
    return this.profileService.eraseMyProfileData(req.user.userId);
  }

  // ─── Business: audience + leads ───────────────────────────────────────────

  @Get('business/leads')
  @ApiOperation({ summary: 'Business: the leads you have acquired via /leads and whether you may call each (requires a certificate)' })
  getBusinessLeads(@Request() req, @Query('businessId') businessId?: string) {
    return this.profileService.getBusinessLeads(req.user.userId, businessId ? Number(businessId) : undefined);
  }

  @Get('certificates')
  @ApiOperation({ summary: 'Business: your issued data-usage certificates' })
  getMyCertificates(@Request() req, @Query('businessId') businessId?: string) {
    return this.profileService.getMyCertificates(req.user.userId, businessId ? Number(businessId) : undefined);
  }

  @Get('certificates/:code/validate')
  @ApiOperation({ summary: 'Validate a data-usage certificate by its public code — confirms the authorisation window' })
  validateCertificate(@Param('code') code: string) {
    return this.profileService.validateCertificate(code);
  }

  @Post('audience/query')
  @ApiOperation({ summary: 'Business: estimate reach and cost for audience filters' })
  queryAudience(@Request() req, @Body() dto: QueryAudienceDto) {
    return this.profileService.queryAudience(req.user.userId, dto);
  }

  @Post('audience/purchase')
  @ApiOperation({ summary: 'Business: purchase lead data matching audience filters' })
  purchaseLeads(@Request() req, @Body() dto: QueryAudienceDto) {
    return this.profileService.purchaseLeads(req.user.userId, dto);
  }

  @Post('audience/report')
  @ApiOperation({ summary: 'Business: get anonymised aggregate report for audience filters' })
  aggregateReport(@Request() req, @Body() dto: QueryAudienceDto) {
    return this.profileService.getAggregateReport(req.user.userId, dto.filters);
  }

  @Post('audience/save')
  @ApiOperation({ summary: 'Business: save an audience filter set for later use' })
  saveAudience(@Request() req, @Body() dto: SaveAudienceDto) {
    return this.profileService.saveAudience(req.user.userId, dto);
  }

  @Get('audience/saved')
  @ApiOperation({ summary: 'Business: list saved audiences' })
  getSavedAudiences(@Request() req) {
    return this.profileService.getMyAudiences(req.user.userId);
  }

  @Delete('audience/:id')
  @ApiOperation({ summary: 'Business: delete a saved audience' })
  deleteAudience(@Request() req, @Param('id') id: number) {
    return this.profileService.deleteAudience(req.user.userId, Number(id));
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Get('admin/fields')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: list all profile fields (including disabled)' })
  adminGetFields() {
    return this.profileService.adminGetAllFields();
  }

  @Post('admin/fields')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: create or update a profile field' })
  adminUpsertField(@Body() dto: UpsertProfileFieldDto) {
    return this.profileService.adminUpsertField(dto);
  }

  @Delete('admin/fields/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: delete a profile field' })
  adminDeleteField(@Param('id') id: number) {
    return this.profileService.adminDeleteField(Number(id));
  }

  @Get('admin/access-logs')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: view all data access logs' })
  adminAccessLogs() {
    return this.profileService.adminGetAllAccessLogs();
  }

  @Get('admin/user/:userId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Admin: view a user's data profile and data-broker settings" })
  adminGetUserDataProfile(@Param('userId') userId: string) {
    return this.profileService.adminGetUserDataProfile(Number(userId));
  }

  @Patch('admin/user/:userId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Admin: control a user's data-broker settings" })
  adminUpdateUserDataBroker(
    @Param('userId') userId: string,
    @Body() dto: AdminUpdateDataBrokerDto,
  ) {
    return this.profileService.adminUpdateUserDataBroker(Number(userId), dto);
  }
}
