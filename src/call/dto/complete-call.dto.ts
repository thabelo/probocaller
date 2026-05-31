import { IsInt, IsPositive, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Hard cap on a single call: 1 hour = 3600s.
// Anything longer is almost certainly an attempt to manipulate billing.
const MAX_CALL_DURATION_SECONDS = 3600;

export class CompleteCallDto {
  @ApiProperty({ example: 42, description: 'ID of the call to complete' })
  @IsInt()
  @IsPositive()
  callId: number;

  @ApiProperty({
    example: 120,
    description: 'Duration of the call in seconds (0 ≤ duration ≤ 3600)',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_CALL_DURATION_SECONDS)
  duration: number;
}
