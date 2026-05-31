import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReportService } from './report.service';
import { IsString, IsOptional } from 'class-validator';

export class SubmitReportDto {
  @IsString()
  phone: string;

  @IsOptional() @IsString()
  country?: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsString()
  phone_local?: string;

  @IsOptional() @IsString()
  reason?: string;
}

@ApiTags('reports')
@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a spam/scam report for a phone number' })
  async submit(@Request() req, @Body() body: SubmitReportDto) {
    return this.reportService.submitReport({
      phone: body.phone,
      country: body.country,
      code: body.code,
      phoneLocal: body.phone_local,
      reason: body.reason,
      reporterPhone: req.user.phoneNumber,
    });
  }

  @Get(':phone')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get risk report for a phone number' })
  async get(@Param('phone') phone: string) {
    const report = await this.reportService.getReport(decodeURIComponent(phone));
    if (!report) {
      return {
        phone,
        country: null,
        code: null,
        phone_local: null,
        spamReports: 0,
        suspectedBusinessReports: 0,
        trustedBusiness: false,
        lastComplaint: null,
        riskScore: 0,
      };
    }
    return {
      phone: report.phone,
      country: report.country,
      code: report.code,
      phone_local: report.phoneLocal,
      spamReports: report.spamReports,
      suspectedBusinessReports: report.suspectedBusinessReports ?? 0,
      trustedBusiness: report.trustedBusiness,
      lastComplaint: report.lastComplaint,
      riskScore: report.riskScore,
    };
  }
}
