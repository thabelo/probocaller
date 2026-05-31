import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPhoneE164 } from '../../common/validation/is-phone-e164';

/**
 * Strict contact shape for `POST /user/add-multiple`. Whitelisting these two
 * fields is the critical security boundary: with the global `ValidationPipe`'s
 * `forbidNonWhitelisted` setting, any extra property (role, walletBalance,
 * isBusiness, etc.) is now rejected — preventing the H1 privilege-escalation
 * path where a contact-import call could mint an admin with a funded wallet.
 */
export class ContactDto {
  @ApiProperty({ example: '+27821234567', description: 'E.164 phone number of the contact' })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @IsPhoneE164()
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'Jane Doe', description: 'Display name as it appears in the user\'s address book' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class AddContactsDto {
  @ApiProperty({ type: [ContactDto], description: 'Up to 500 contacts per request' })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  users: ContactDto[];
}
