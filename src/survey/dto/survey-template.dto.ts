import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength,
  Matches, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { QUESTION_TYPES, QuestionType } from '../question-type';

/**
 * Strict allow-lists for console curation of the template library. Any extra
 * field is rejected by the global ValidationPipe (forbidNonWhitelisted: true).
 */
export class TemplateQuestionDto {
  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  type: QuestionType;

  @ApiProperty()
  @IsString() @MaxLength(500)
  prompt: string;

  /** Required for multiple_choice and dropdown; the service enforces that. */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(160, { each: true })
  options?: string[];

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  required?: boolean;
}

export class CreateTemplateDto {
  /** Stable identifier, e.g. 'insurance-nps'. Lower-case kebab, like app keys. */
  @ApiProperty()
  @IsString() @MaxLength(60)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'key must be lower-case kebab-case' })
  key: string;

  @ApiProperty()
  @IsString() @MaxLength(80)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(400)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(64)
  category?: string;

  @ApiProperty({ type: [TemplateQuestionDto] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto)
  questions: TemplateQuestionDto[];
}

/**
 * `key` is deliberately absent: a survey is built from a template by key, so
 * renaming one would orphan that trail. Retiring is `isActive: false` — never
 * a delete, so surveys stay traceable to where they came from.
 */
export class UpdateTemplateDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(400)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(64)
  category?: string;

  @ApiProperty({ required: false, type: [TemplateQuestionDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto)
  questions?: TemplateQuestionDto[];

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
