import { IsNumber, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Per-request top-up cap. Prevents single-request runaway amounts.
// Real top-ups should go through a payment processor; this endpoint is for
// (sandboxed) self-credit by business accounts and should be modest.
const MAX_TOPUP_AMOUNT = 1000;

export class AddCreditDto {
  @ApiProperty({ example: 10, description: 'Amount to add (positive, in USD)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(MAX_TOPUP_AMOUNT)
  amount: number;
}
