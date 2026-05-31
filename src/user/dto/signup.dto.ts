import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPhoneE164 } from '../../common/validation/is-phone-e164';

export class SignupDto {
  @ApiProperty({ example: '+27821234567', description: 'Phone number in E.164 format' })
  @IsString()
  @IsNotEmpty()
  @IsPhoneE164()
  phoneNumber: string;

  @ApiProperty({ example: 'user@example.com', description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe', description: 'Full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'PROBO-42', description: 'Referral code from an existing user' })
  @IsOptional()
  @IsString()
  referralCode?: string;
}