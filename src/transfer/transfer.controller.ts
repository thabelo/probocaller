import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, Min, MinLength } from 'class-validator';
import { TransferService } from './transfer.service';
import { AdminGuard } from '../admin/admin.guard';

export class TransferDto {
  @IsString() @MinLength(7) recipientPhone: string;
  @IsNumber() @Min(0.0001) amount: number;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('transfers')
export class TransferController {
  constructor(private readonly service: TransferService) {}

  @Post()
  @ApiOperation({ summary: 'Send cash to another Probo user (atomic).' })
  send(@Request() req, @Body() dto: TransferDto) {
    return this.service.send(req.user.userId, dto.recipientPhone, Number(dto.amount), dto.note);
  }

  /**
   * Money held against a number with no account appears in nobody's wallet and
   * nobody's statement, so this is the only place it can be seen.
   */
  @Get('admin/all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Every P2P movement, completed and held, for admin review' })
  listForAdmin() {
    return this.service.listForAdmin();
  }
}
