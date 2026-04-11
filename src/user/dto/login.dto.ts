import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '1234567890', description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}