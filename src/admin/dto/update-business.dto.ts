import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
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

  // Registration requires a logo, and the businesses that predate that rule
  // have none — an admin is the only one who can correct those. Format is not
  // validated here: a blank must reach the service, which is what refuses it.
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(300)
  logoUrl?: string;

  // ISO 3166-1 alpha-2, mirroring the Business entity — required for a NEW
  // registration (derived from the user's phone by the mobile app) but the
  // admin edit form must be able to view/correct it too.
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @Length(2, 2)
  country?: string;

  // @IsOptional() only skips validation for null/undefined, not ''. The admin
  // edit form always sends every field (pre-filled with '' when unset), so
  // website/contactEmail need an explicit "only validate format when non-empty"
  // guard or saving a profile with no website/email always 400s.
  @ApiProperty({ required: false })
  @ValidateIf((o) => !!o.website) @IsUrl({ require_protocol: true })
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o) => !!o.contactEmail) @IsEmail()
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

  // Pay-to-Contact default bid (credits). 0 disables the default.
  @ApiProperty({ required: false, description: 'Default Pay-to-Contact bid in credits' })
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  defaultBidAmount?: number;
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
