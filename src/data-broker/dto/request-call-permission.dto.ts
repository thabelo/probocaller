import { IsInt, IsString, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestCallPermissionDto {
  @ApiProperty({ description: 'ID of the target user to request call permission from' })
  @IsInt()
  targetUserId: number;

  @ApiPropertyOptional({ maxLength: 160, description: 'Short pitch explaining the call purpose' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  pitch?: string;

  @ApiPropertyOptional({ description: 'Call category (e.g. BANKING, INSURANCE)' })
  @IsOptional()
  @IsString()
  callCategory?: string;

  @ApiPropertyOptional({
    description:
      'Pay-to-Contact bid: credits the business stakes to reach this user. '
      + 'Staked on request, paid to the user (minus platform fee) on approval, refunded on rejection.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bidAmount?: number;
}
