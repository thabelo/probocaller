import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateWhitelistedNumberDto {
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
