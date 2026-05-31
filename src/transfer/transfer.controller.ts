import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, Min, MinLength } from 'class-validator';
import { TransferService } from './transfer.service';

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
}
