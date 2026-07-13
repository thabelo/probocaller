import { IsString, IsIn, IsBoolean, IsArray, IsOptional, ValidateNested, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class CallWindowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;
}

export class UpdatePrivacyPreferencesDto {
  // One of the six tier presets, 'custom', or a legacy value (mapped on save).
  @ApiPropertyOptional({
    enum: ['all_calls', 'all_paid_biz', 'contacts_paid_biz', 'paid_all', 'contacts_only', 'dnd', 'custom'],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'all_calls', 'all_paid_biz', 'contacts_paid_biz', 'paid_all', 'contacts_only', 'dnd', 'custom',
    'everyone', 'all', 'approved_only', 'none', // legacy — mapped to dials on save
  ])
  callPermissionMode?: string;

  // Custom per-category policies (see call/call-policy.ts). Each free|paid|blocked.
  // Take precedence over a preset when sent.
  @ApiPropertyOptional({ enum: ['free', 'paid', 'blocked'] })
  @IsOptional()
  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  contactsCallPolicy?: string;

  @ApiPropertyOptional({ enum: ['free', 'paid', 'blocked'] })
  @IsOptional()
  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  businessCallPolicy?: string;

  @ApiPropertyOptional({ enum: ['free', 'paid', 'blocked'] })
  @IsOptional()
  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  newCallPolicy?: string;

  @ApiPropertyOptional({ enum: ['free', 'paid', 'blocked'] })
  @IsOptional()
  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  unknownCallPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallWindowDto)
  allowedCallWindows?: CallWindowDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dataShareEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataCategories?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incognitoEnabled?: boolean;
}
