import { Controller, Get, Put, Delete, UseGuards, Request, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MinLength, Length } from 'class-validator';
import { BankAccountService } from './bank-account.service';

export class BankAccountDto {
  @IsOptional() @IsString() @Length(2, 2) country?: string;   // ISO alpha-2
  @IsString() @MinLength(2) bankName: string;
  @IsString() @MinLength(2) accountHolder: string;
  @IsString() @MinLength(4) accountNumber: string;
  @IsOptional() @IsIn(['cheque', 'savings', 'transmission']) accountType?: string;
  @IsOptional() @IsString() branchCode?: string;
}

@ApiTags('bank-account')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('bank-account')
export class BankAccountController {
  constructor(private readonly service: BankAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Get my bank account (null if none on file)' })
  async get(@Request() req) {
    const account = await this.service.getByUser(req.user.userId);
    return { account };
  }

  @Put()
  @ApiOperation({ summary: 'Create or update my bank account' })
  async upsert(@Request() req, @Body() dto: BankAccountDto) {
    const account = await this.service.upsert(req.user.userId, dto);
    return { account };
  }

  @Delete()
  @ApiOperation({ summary: 'Remove my bank account' })
  remove(@Request() req) {
    return this.service.remove(req.user.userId);
  }
}
