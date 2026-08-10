import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWhitelistedNumberDto } from './create-whitelisted-number.dto';

describe('CreateWhitelistedNumberDto', () => {
  it('rejects an empty phoneNumber', async () => {
    const dto = plainToInstance(CreateWhitelistedNumberDto, { phoneNumber: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing phoneNumber', async () => {
    const dto = plainToInstance(CreateWhitelistedNumberDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a valid phoneNumber with no label', async () => {
    const dto = plainToInstance(CreateWhitelistedNumberDto, { phoneNumber: '+27721234567' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid phoneNumber with a label', async () => {
    const dto = plainToInstance(CreateWhitelistedNumberDto, { phoneNumber: '+27721234567', label: 'Acme Bank' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string label', async () => {
    const dto = plainToInstance(CreateWhitelistedNumberDto, { phoneNumber: '+27721234567', label: 123 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
