import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Strict allow-list for admin business profile edits. Any extra field is rejected
// by the global ValidationPipe (forbidNonWhitelisted: true), preventing mass
// assignment of sensitive fields like `verified`, `userId`, or `walletBalance`.
export class AdminUpdateBusinessDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(120)
  companyName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(80)
  industry?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(80)
  registrationNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsUrl({ require_protocol: true })
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsEmail()
  contactEmail?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, enum: ['unverified', 'verified', 'trusted', 'premium'] })
  @IsOptional() @IsString() @IsIn(['unverified', 'verified', 'trusted', 'premium'])
  tier?: string;
}

export class AdminUpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isBusiness?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  walletBalance?: number;

  @ApiProperty({ required: false, enum: ['user', 'admin'] })
  @IsOptional() @IsString()
  role?: 'user' | 'admin';

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isSpam?: boolean;
}
