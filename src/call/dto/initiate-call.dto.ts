import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateCallDto {
  @ApiProperty({ example: '+27 71 234 5678', description: 'Destination phone number' })
  @IsString()
  @IsNotEmpty()
  // Accept E.164-ish numbers (digits, spaces, dashes, parens, leading +). Length 5–32.
  @Matches(/^\+?[\d\s().-]{5,32}$/, { message: 'toPhoneNumber must be a valid phone number' })
  toPhoneNumber: string;
}
