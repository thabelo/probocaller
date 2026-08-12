import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { APP_STATUSES } from '../marketplace.service';

/**
 * Strict allow-list for admin catalogue edits. Any extra field is rejected by
 * the global ValidationPipe (forbidNonWhitelisted: true).
 *
 * `key` is deliberately absent: the mobile binary switches on it to find an
 * app's screens, so renaming one would orphan a shipped feature. `audience` and
 * `pairedAppKey` are absent for the same reason — they describe what the app
 * fundamentally is, not how it is presented.
 */
export class UpdateAppDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(60)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(160)
  tagline?: string;

  /** Heroicons outline component name, resolved by the client. */
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(60)
  icon?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(40)
  category?: string;

  @ApiProperty({ required: false, enum: APP_STATUSES })
  @IsOptional() @IsIn(APP_STATUSES)
  status?: (typeof APP_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  requiresKyb?: boolean;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(20)
  minAppVersion?: string;
}
