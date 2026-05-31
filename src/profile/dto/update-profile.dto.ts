import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Key-value map of field key to user-provided value' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Per-field floor price in credits: { fieldKey: amount }' })
  @IsOptional()
  @IsObject()
  floorPrices?: Record<string, number>;
}
