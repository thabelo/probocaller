import { IsObject, IsOptional, IsString, IsNumber, Min, IsIn } from 'class-validator';
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
