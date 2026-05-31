import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalStatus } from './withdrawal.entity';

export class ReviewWithdrawalDto {
  @IsIn(['paid', 'rejected']) decision: 'paid' | 'rejected';
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('admin-withdrawals')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('admin/withdrawals')
export class AdminWithdrawalController {
  constructor(private readonly service: WithdrawalService) {}

  @Get()
  @ApiOperation({ summary: '[admin] List withdrawals, optionally filtered by status' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'cancelled', 'paid', 'rejected'] })
  list(@Query('status') status?: WithdrawalStatus) {
    return this.service.listAll(status);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: '[admin] Mark a pending withdrawal as paid or rejected' })
  review(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: ReviewWithdrawalDto) {
    return this.service.review(req.user.userId, id, dto.decision, dto.notes);
  }
}
