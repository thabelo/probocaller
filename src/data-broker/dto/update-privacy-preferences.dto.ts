import { IsString, IsIn, IsBoolean, IsArray, IsOptional, IsNotEmpty, ValidateNested, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// One saved custom rule: a standalone named four-category policy that sits
// beside the six preset tiers in the same radio group.
export class CustomCallRuleDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  contacts: string;

  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  business: string;

  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  newCaller: string;

  @IsString()
  @IsIn(['free', 'paid', 'blocked'])
  unknown: string;
}

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

  // Full replacement of the user's saved custom rules (create/rename/delete by
  // resending the list). Uniqueness/emptiness of names is enforced in the service.
  @ApiPropertyOptional({ type: [CustomCallRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomCallRuleDto)
  customCallRules?: CustomCallRuleDto[];

  // Select a saved custom rule by id ('' reverts to the base preset tier).
  @ApiPropertyOptional({ type: 'string' })
  @IsOptional()
  @IsString()
  selectedCustomRuleId?: string;

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
