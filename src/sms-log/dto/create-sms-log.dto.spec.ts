import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSmsLogDto } from './create-sms-log.dto';

const validHash = 'a'.repeat(32);

describe('CreateSmsLogDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: validHash,
      category: 'contacts',
      decision: 'free',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a bodyHash that is not exactly 32 hex chars', async () => {
    const tooShort = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: 'abc123',
      category: 'contacts',
      decision: 'free',
    });
    expect((await validate(tooShort)).length).toBeGreaterThan(0);

    const tooLong = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: 'a'.repeat(33),
      category: 'contacts',
      decision: 'free',
    });
    expect((await validate(tooLong)).length).toBeGreaterThan(0);
  });

  it('rejects a bodyHash with non-hex characters', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: 'g'.repeat(32),
      category: 'contacts',
      decision: 'free',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects an uppercase-hex bodyHash (must be lowercase)', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: 'A'.repeat(32),
      category: 'contacts',
      decision: 'free',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects an invalid category', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: validHash,
      category: 'spam',
      decision: 'free',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects an invalid decision', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      address: '+27821234567',
      bodyHash: validHash,
      category: 'contacts',
      decision: 'allowed',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects a missing address', async () => {
    const dto = plainToInstance(CreateSmsLogDto, {
      bodyHash: validHash,
      category: 'contacts',
      decision: 'free',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
