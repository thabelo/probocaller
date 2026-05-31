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
