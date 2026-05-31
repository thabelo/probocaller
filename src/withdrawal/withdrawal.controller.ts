import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { WithdrawalService } from './withdrawal.service';

export class CreateWithdrawalDto {
  @IsNumber() @Min(0.0001)
  amount: number;
}

@ApiTags('withdrawals')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('withdrawals')
export class WithdrawalController {
  constructor(private readonly service: WithdrawalService) {}

  @Get()
  @ApiOperation({ summary: 'List my withdrawals' })
  list(@Request() req) {
    return this.service.listMine(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Request a withdrawal (requires FICA approved + bank account)' })
  create(@Request() req, @Body() dto: CreateWithdrawalDto) {
    return this.service.request(req.user.userId, Number(dto.amount));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending withdrawal (refunds the held amount)' })
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(req.user.userId, id);
  }
}
