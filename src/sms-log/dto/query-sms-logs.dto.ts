import { IsOptional, IsIn, IsString, IsISO8601, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for the cross-user admin SMS-logs endpoint
 * (GET /admin/sms-logs). Every field is optional: absent means "don't narrow
 * on this axis". page/limit arrive as query strings so they are coerced to
 * bounded integers; the enum-ish fields reject off-list values.
 */
export class QuerySmsLogsDto {
  // Inclusive createdAt lower bound (ISO date or date-time).
  @IsOptional()
  @IsISO8601()
  from?: string;

  // Inclusive createdAt upper bound (ISO date or date-time). A date-only value
  // is treated as the end of that UTC day so the range stays intuitive.
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['free', 'paid', 'blocked'])
  decision?: string;

  @IsOptional()
  @IsIn(['contacts', 'business', 'newSender', 'unknown'])
  category?: string;

  // Case-insensitive substring match on the sender address.
  @IsOptional()
  @IsString()
  address?: string;

  // Exact match on the scam keyword/pattern that blocked a message.
  @IsOptional()
  @IsString()
  keyword?: string;

  // Cross-user by default; narrow to one receiving user when supplied.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
