import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateScamKeywordDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  keyword: string;
}
