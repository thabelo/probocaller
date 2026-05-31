import { IsNumber, Max, Min, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Admin can credit OR debit, but with sane bounds: ±$100k per call.
const ADMIN_ADJUST_LIMIT = 100_000;

export class AdminCreditDto {
  @ApiProperty({
    example: 25,
    description: 'Amount to credit (positive) or debit (negative). Cannot be 0.',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-ADMIN_ADJUST_LIMIT)
  @Max(ADMIN_ADJUST_LIMIT)
  @NotEquals(0)
  amount: number;
}
