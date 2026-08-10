import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWhitelistedNumberDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  label?: string;
}
