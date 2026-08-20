import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM/APNs device token from the app' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ enum: ['android', 'ios'], default: 'android' })
  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios'])
  platform?: 'android' | 'ios';
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'The device token to stop pushing to' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
