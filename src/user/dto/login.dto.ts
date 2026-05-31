import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPhoneE164 } from '../../common/validation/is-phone-e164';

export class LoginDto {
  @ApiProperty({ example: '+27821234567', description: 'Phone number in E.164 format' })
  @IsString()
  @IsNotEmpty()
  @IsPhoneE164()
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'PROBO-42', description: 'Referral code from an existing user' })
  @IsOptional()
  @IsString()
  referralCode?: string;
}