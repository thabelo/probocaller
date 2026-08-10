import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateScamKeywordDto } from './update-scam-keyword.dto';

describe('UpdateScamKeywordDto', () => {
  it('accepts an update with only active set', async () => {
    const dto = plainToInstance(UpdateScamKeywordDto, { active: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an update with only keyword set', async () => {
    const dto = plainToInstance(UpdateScamKeywordDto, { keyword: 'new phrase' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a too-short keyword when provided', async () => {
    const dto = plainToInstance(UpdateScamKeywordDto, { keyword: 'a' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-boolean active value', async () => {
    const dto = plainToInstance(UpdateScamKeywordDto, { active: 'yes' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
