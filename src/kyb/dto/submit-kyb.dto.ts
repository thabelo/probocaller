import { IsString, IsNotEmpty, IsUppercase, Length, IsObject, IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitKybDto {
  @ApiProperty({ example: 1, description: 'ID of the business profile this KYB submission belongs to' })
  @IsInt()
  @IsPositive()
  businessId: number;

  @ApiProperty({ example: 'ZA', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(2, 2)
  countryCode: string;

  @ApiProperty({
    example: { legal_name: 'Acme (Pty) Ltd', registration_number: '2021/123456/07', tax_number: '9123456789' },
    description: 'Country-specific business info fields as returned by GET /kyb/requirements/:countryCode',
  })
  @IsObject()
  businessInfo: Record<string, any>;
}
