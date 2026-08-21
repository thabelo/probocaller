import { IsArray, IsOptional, IsString, ValidateNested, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyseSmsMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1600) // one long SMS; anything larger is not a text message
  body: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(32)
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  receivedAt?: string;
}

/**
 * The device uploads SMS text for analysis — ONLY sent for a user who turned
 * smsAnalysisConsent on; the server refuses it otherwise. Capped so this is a
 * batch of recent messages, not a bulk dump.
 */
export class AnalyseSmsDto {
  @ApiProperty({ type: [AnalyseSmsMessageDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnalyseSmsMessageDto)
  messages: AnalyseSmsMessageDto[];
}
