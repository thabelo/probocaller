import { IsString, IsNotEmpty, IsIn, IsOptional, Length, MaxLength, Matches } from 'class-validator';

export class CreateSmsLogDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  // MD5 hash of the message body, computed on-device — the server never sees
  // the plaintext SMS. Only the format is validated here, not that it is
  // actually unhashable-plaintext-checked.
  @IsString()
  @Length(32, 32)
  @Matches(/^[a-f0-9]+$/)
  bodyHash: string;

  @IsIn(['contacts', 'business', 'newSender', 'unknown'])
  category: string;

  @IsIn(['free', 'paid', 'blocked'])
  decision: string;

  // The scam keyword/pattern that matched this message, when the block was
  // driven by keyword matching. Omitted for policy-only blocks or allowed
  // messages.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchedKeyword?: string;
}
