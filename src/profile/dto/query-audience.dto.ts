import { IsObject, IsOptional, IsString, IsNumber, Min, IsIn, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryAudienceDto {
  @ApiPropertyOptional({
    description: 'Filter map: { fieldKey: { op: "eq"|"gte"|"lte"|"in", value: any } }',
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, { op: string; value: any }>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Consent duration in days. Omit for permanent.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  consentDays?: number;

  @ApiPropertyOptional({ description: 'Only profiles updated on/after this ISO date.' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Only profiles updated on/before this ISO date.' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Estimate reach/cost without billing the wallet.' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ description: 'Purchase on behalf of this owned business (else the caller’s default business).' })
  @IsOptional()
  @IsNumber()
  businessId?: number;
}

export class SaveAudienceDto {
  @ApiPropertyOptional()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  filters?: Record<string, { op: string; value: any }>;
}
