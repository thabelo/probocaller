import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateWhitelistedNumberDto } from './update-whitelisted-number.dto';

describe('UpdateWhitelistedNumberDto', () => {
  it('accepts an update with only active set', async () => {
    const dto = plainToInstance(UpdateWhitelistedNumberDto, { active: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an update with only phoneNumber set', async () => {
    const dto = plainToInstance(UpdateWhitelistedNumberDto, { phoneNumber: '+27721234567' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an update with only label set', async () => {
    const dto = plainToInstance(UpdateWhitelistedNumberDto, { label: 'Acme Bank' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-boolean active value', async () => {
    const dto = plainToInstance(UpdateWhitelistedNumberDto, { active: 'yes' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-string phoneNumber when provided', async () => {
    const dto = plainToInstance(UpdateWhitelistedNumberDto, { phoneNumber: 12345 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
