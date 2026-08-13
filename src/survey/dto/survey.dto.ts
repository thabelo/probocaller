import {
  ArrayMinSize, IsArray, IsInt, IsObject, IsOptional, IsPositive, IsString,
  Matches, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TemplateQuestionDto } from './survey-template.dto';

/**
 * Strict allow-lists for the survey builder. The global ValidationPipe runs
 * with forbidNonWhitelisted, so what these omit cannot be set at all.
 *
 * Money fields are absent on purpose: `pricePerResponse`, `totalHeld` and
 * `totalPaid` are computed from the question types and frozen at publish. A
 * client that could send them could name its own price. `status` is absent for
 * the same reason — publishing is what moves money, so it is its own operation,
 * not a field.
 */
export class CreateSurveyDto {
  @ApiProperty()
  @IsInt() @IsPositive()
  businessId: number;

  @ApiProperty()
  @IsString() @MaxLength(120)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  /** Reporting label only — matching is `filters` (§3.2). */
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(64)
  category?: string;

  /** Respondent matching: age band, province, industry, other profile fields. */
  @ApiProperty({ required: false, type: Object })
  @IsOptional() @IsObject()
  filters?: Record<string, unknown>;

  @ApiProperty()
  @IsInt() @IsPositive()
  targetResponses: number;

  /** Days to run for; null runs indefinitely until the target is met (§3.3). */
  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsInt() @Min(1)
  durationDays?: number | null;

  /** Give questions outright… */
  @ApiProperty({ required: false, type: [TemplateQuestionDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto)
  questions?: TemplateQuestionDto[];

  /** …or name a template to copy them from. */
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(60)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'templateKey must be lower-case kebab-case' })
  templateKey?: string;
}

/**
 * `businessId` is absent: a survey cannot be moved between businesses, since
 * the wallet that funds it belongs to one of them. `templateKey` is absent
 * because a template is copied at creation and never re-applied.
 */
export class UpdateSurveyDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(64)
  category?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional() @IsObject()
  filters?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional() @IsInt() @IsPositive()
  targetResponses?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsInt() @Min(1)
  durationDays?: number | null;

  @ApiProperty({ required: false, type: [TemplateQuestionDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto)
  questions?: TemplateQuestionDto[];
}

/**
 * Pricing a survey that does not exist yet. Deliberately not a subset of
 * CreateSurveyDto: quoting needs no business, no title and no targeting — only
 * the work being asked for and how many responses are wanted.
 */
export class QuoteSurveyDto {
  @ApiProperty({ type: [TemplateQuestionDto] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto)
  questions: TemplateQuestionDto[];

  @ApiProperty()
  @IsInt() @IsPositive()
  targetResponses: number;
}
