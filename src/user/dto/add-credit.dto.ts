import { IsNumber, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// The REAL, admin-configurable top-up ceiling is the MAX_TOPUP_AMOUNT
// setting row (see UserController.addCredit — a class-validator decorator is
// static and can't read a live DB value per-request). This decorator is
// purely a malformed-request sanity guard against absurd payloads.
const MALFORMED_REQUEST_GUARD = 1_000_000;

export class AddCreditDto {
  @ApiProperty({ example: 10, description: 'Amount to add (positive, in ZAR)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(MALFORMED_REQUEST_GUARD)
  amount: number;
}
