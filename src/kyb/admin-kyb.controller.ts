import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { KybService } from './kyb.service';
import { ReviewKybDto } from './dto/review-kyb.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/kyb')
export class AdminKybController {
  constructor(private readonly kybService: KybService) {}

  @Get('submissions')
  @ApiOperation({ summary: 'List all KYB submissions with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'pending', 'under_review', 'approved', 'rejected'] })
  @ApiQuery({ name: 'countryCode', required: false, description: 'ISO 3166-1 alpha-2' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by company name or business info' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listSubmissions(
    @Query('status') status?: string,
    @Query('countryCode') countryCode?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.kybService.listSubmissions({
      status,
      countryCode,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get full details of a KYB submission (with documents)' })
  getSubmission(@Param('id', ParseIntPipe) id: number) {
    return this.kybService.getSubmission(id);
  }

  @Patch('submissions/:id/review')
  @ApiOperation({
    summary: 'Approve, reject, or mark a submission as under review',
    description: 'Approving a submission automatically sets business.verified = true. Rejecting reverts it to false.',
  })
  reviewSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewKybDto,
    @Request() req,
  ) {
    return this.kybService.reviewSubmission(id, req.user.userId, dto);
  }

  @Get('documents/:id/file')
  @ApiOperation({ summary: 'Download / view a KYB document file' })
  async downloadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const filePath = await this.kybService.getDocumentFilePath(id);
    res.sendFile(filePath);
  }
}
