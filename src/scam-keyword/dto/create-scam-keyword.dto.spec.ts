import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateScamKeywordDto } from './create-scam-keyword.dto';

describe('CreateScamKeywordDto', () => {
  it('rejects an empty keyword', async () => {
    const dto = plainToInstance(CreateScamKeywordDto, { keyword: '   ' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a keyword shorter than 2 characters', async () => {
    const dto = plainToInstance(CreateScamKeywordDto, { keyword: 'a' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a valid keyword', async () => {
    const dto = plainToInstance(CreateScamKeywordDto, { keyword: 'free bitcoin' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
