import { IsOptional, IsBoolean, IsArray, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Admin controls for a user's data-broker settings. */
export class AdminUpdateDataBrokerDto {
  @ApiPropertyOptional({ description: 'Master data-sharing switch for the user.' })
  @IsOptional()
  @IsBoolean()
  dataShareEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Premium incognito mode.' })
  @IsOptional()
  @IsBoolean()
  incognitoEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Data categories the user shares.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataCategories?: string[];
}
