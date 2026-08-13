import {
  IsArray, IsInt, IsOptional, IsPositive, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * One answer. Single-value types (free text, yes/no, one chosen option) use
 * `valueText`; multi-select uses `valueJson`. Which one is allowed follows from
 * the question's TYPE and is enforced server-side, not by the client's choice
 * of field.
 */
export class AnswerDto {
  @ApiProperty()
  @IsInt() @IsPositive()
  questionId: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(5000)
  valueText?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true })
  valueJson?: string[];
}

/**
 * Submitting a completed survey.
 *
 * There is deliberately no amount here: the payout is the survey's price,
 * frozen at publish and read server-side. A client that could send an amount
 * could pay itself out of the business's escrow.
 */
export class SubmitAnswersDto {
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers: AnswerDto[];
}
