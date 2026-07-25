import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, ParseIntPipe, HttpCode, HttpStatus, Header, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { BusinessService } from '../business/business.service';
import { AdminCreditDto } from './dto/admin-credit.dto';
import { AdminUpdateBusinessDto, AdminUpdateUserDto } from './dto/update-business.dto';
import { ReportService } from '../report/report.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneReport } from '../report/phone-report.entity';
import { ReverseLookupService } from '../lookup/reverse-lookup.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly businessService: BusinessService,
    private readonly reportService: ReportService,
    @InjectRepository(PhoneReport)
    private readonly reportRepo: Repository<PhoneReport>,
    private readonly reverseLookup: ReverseLookupService,
  ) {}

  @Get('reverse-lookups')
  @ApiOperation({ summary: 'Reverse-lookup (Google Places) usage, cost and stats' })
  async getReverseLookupStats() {
    return this.reverseLookup.getStats();
  }

  @Get('reverse-lookups/history')
  @ApiOperation({ summary: 'Recent reverse-lookup billing events' })
  async getReverseLookupHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reverseLookup.getHistory(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('revenue-trend')
  @ApiOperation({ summary: 'Get 30-day daily revenue trend' })
  async getRevenueTrend() {
    return this.adminService.getRevenueTrend();
  }

  @Get('top-businesses')
  @ApiOperation({ summary: 'Get top businesses by total spend' })
  async getTopBusinesses() {
    return this.adminService.getTopBusinesses();
  }

  @Get('users')
  @ApiOperation({ summary: 'Get users (optional server-side search + pagination)' })
  async getAllUsers(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getAllUsers({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('users/bulk')
  @ApiOperation({ summary: 'Bulk-update users (whitelisted, non-monetary fields)' })
  async bulkUpdateUsers(
    @Request() req,
    @Body() body: { ids: number[]; patch: { isSpam?: boolean; role?: string; isBusiness?: boolean } },
  ) {
    return this.adminService.bulkUpdateUsers(body.ids, body.patch, req.user?.userId);
  }

  @Get('users/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  @ApiOperation({ summary: 'Export all users as CSV' })
  async exportUsers() {
    return this.adminService.exportUsersCsv();
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user fields' })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Get('users/:id/privacy')
  @ApiOperation({ summary: 'Get privacy/data-broker settings for a user' })
  async getUserPrivacy(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.adminGetUserPrivacy(id);
  }

  @Put('users/:id/privacy')
  @ApiOperation({ summary: 'Override privacy/data-broker settings for a user' })
  async updateUserPrivacy(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.adminService.adminUpdateUserPrivacy(id, body);
  }

  @Post('users/:id/credit')
  @ApiOperation({ summary: 'Add or deduct wallet credits (admin only, bounded)' })
  async addCredit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminCreditDto,
  ) {
    return this.adminService.addCredit(id, body.amount);
  }

  @Get('calls/live')
  @ApiOperation({ summary: 'Get currently active (in-progress) calls' })
  async getLiveCalls() {
    return this.adminService.getLiveCalls();
  }

  @Get('calls')
  @ApiOperation({ summary: 'Get all calls (with optional filters)' })
  async getAllCalls(
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminService.getAllCalls({ search, from, to });
  }

  @Get('config')
  @ApiOperation({ summary: 'Get platform config' })
  async getConfig() {
    return this.adminService.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Update a config key' })
  async updateConfig(@Body() body: { key: string; value: string }) {
    return this.adminService.updateConfig(body.key, body.value);
  }

  // ─── Business profile management ───────────────────────────────────────────

  @Get('businesses/:id/stats')
  @ApiOperation({ summary: 'Get spending stats for a business' })
  async getBusinessStats(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getBusinessStats(id);
  }

  @Get('businesses')
  @ApiOperation({ summary: 'Get all registered business profiles' })
  async getAllBusinesses() {
    return this.businessService.getAllProfiles();
  }

  @Put('businesses/:id/verify')
  @ApiOperation({ summary: 'Verify or unverify a business profile' })
  async verifyBusiness(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { verified: boolean },
  ) {
    return this.businessService.verifyProfile(id, body.verified);
  }

  @Put('businesses/:id')
  @ApiOperation({ summary: 'Update a business profile (admin override)' })
  async updateBusiness(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateBusinessDto,
  ) {
    return this.businessService.adminUpdateProfile(id, body);
  }

  @Delete('businesses/numbers/:numberId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a registered number (admin)' })
  async adminDeleteNumber(@Param('numberId', ParseIntPipe) numberId: number) {
    return this.businessService.adminDeleteNumber(numberId);
  }

  @Post('businesses/:id/numbers')
  @ApiOperation({ summary: 'Add a phone number to a business profile (admin)' })
  async adminAddNumber(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { phoneNumber: string; purpose: string; label?: string },
  ) {
    return this.businessService.adminAddNumber(id, body);
  }

  @Post('businesses')
  @ApiOperation({ summary: 'Register a new business profile for a user (admin)' })
  async adminCreateBusiness(
    @Body() body: { userId: number; companyName: string; industry: string; country: string; description?: string; contactPhone?: string; contactEmail?: string; website?: string; registrationNumber?: string; address?: string },
  ) {
    const { userId, ...data } = body;
    return this.businessService.adminRegisterBusiness(userId, data);
  }

  // ─── Spam / Report management ──────────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'List all phone reports with optional period filter' })
  async getReports(@Query('period') period?: string) {
    let from: Date | undefined;
    const now = new Date();
    if (period === 'day') {
      from = new Date(now); from.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const qb = this.reportRepo.createQueryBuilder('r').orderBy('r.spamReports', 'DESC');
    if (from) qb.where('r.updatedAt >= :from', { from });
    const reports = await qb.getMany();

    return reports.map(r => ({
      id: r.id,
      phone: r.phone,
      country: r.country,
      code: r.code,
      phone_local: r.phoneLocal,
      spamReports: r.spamReports,
      trustedBusiness: r.trustedBusiness,
      lastComplaint: r.lastComplaint,
      lastReason: r.lastReason ?? null,
      riskScore: r.riskScore,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Get('reports/stats')
  @ApiOperation({ summary: 'Aggregate stats for the reports dashboard' })
  async getReportStats() {
    const all = await this.reportRepo.find();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const total = all.length;
    const highRisk = all.filter(r => r.riskScore >= 70).length;
    const reportedToday = all.filter(r => r.lastComplaint === today.toISOString().slice(0, 10)).length;
    const totalReports = all.reduce((s, r) => s + r.spamReports, 0);
    const trusted = all.filter(r => r.trustedBusiness).length;

    // Daily trend for last 30 days
    const trend: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      trend[d.toISOString().slice(0, 10)] = 0;
    }
    all.forEach(r => {
      if (r.lastComplaint && trend[r.lastComplaint] !== undefined) {
        trend[r.lastComplaint] += r.spamReports;
      }
    });
    const dailyTrend = Object.entries(trend).map(([date, count]) => ({ date, count }));

    return { total, highRisk, reportedToday, totalReports, trusted, dailyTrend };
  }

  @Put('reports/:id/trust')
  @ApiOperation({ summary: 'Toggle trustedBusiness flag on a report record' })
  async setTrusted(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { trusted: boolean },
  ) {
    const record = await this.reportRepo.findOne({ where: { id } });
    if (!record) return { error: 'Not found' };
    record.trustedBusiness = body.trusted;
    record.riskScore = Math.max(0, record.riskScore + (body.trusted ? -10 : 10));
    return this.reportRepo.save(record);
  }

}
