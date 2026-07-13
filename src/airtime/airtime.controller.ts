import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';
import { AirtimeService } from './airtime.service';

export class RedeemAirtimeDto {
  @IsNumber() @Min(1)
  amount: number;

  @IsString()
  phoneNumber: string;

  @IsString()
  network: string;
}

@ApiTags('airtime')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('airtime')
export class AirtimeController {
  constructor(private readonly service: AirtimeService) {}

  @Get('networks')
  @ApiOperation({ summary: 'Supported SA networks and min/max airtime amounts' })
  networks() {
    return this.service.networks();
  }

  @Get()
  @ApiOperation({ summary: 'My airtime redemption history' })
  list(@Request() req) {
    return this.service.listMine(req.user.userId);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem wallet balance as mobile airtime (South Africa)' })
  redeem(@Request() req, @Body() dto: RedeemAirtimeDto) {
    return this.service.redeem(req.user.userId, dto);
  }
}
