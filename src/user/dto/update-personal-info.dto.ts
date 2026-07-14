import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Self-service edit of the account owner's personal data. Only name + email are
 * editable; the phone number is the verified login identity and is not changed
 * here. Both fields are optional to allow partial updates.
 */
export class UpdatePersonalInfoDto {
  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
