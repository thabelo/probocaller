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
  @ApiPropertyOptional({ enum: ['everyone', 'all', 'approved_only', 'none'] })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'all', 'approved_only', 'none'])
  callPermissionMode?: string;

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
