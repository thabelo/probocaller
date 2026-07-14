import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePersonalInfoDto } from './update-personal-info.dto';

const errorsFor = async (obj: any) =>
  validate(plainToInstance(UpdatePersonalInfoDto, obj));

describe('UpdatePersonalInfoDto', () => {
  it('accepts a name and a valid email', async () => {
    expect(await errorsFor({ name: 'Ada Lovelace', email: 'ada@example.com' })).toHaveLength(0);
  });

  it('accepts a partial update (name only, or email only)', async () => {
    expect(await errorsFor({ name: 'Ada' })).toHaveLength(0);
    expect(await errorsFor({ email: 'ada@example.com' })).toHaveLength(0);
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    expect((await errorsFor({ email: 'not-an-email' })).length).toBeGreaterThan(0);
  });

  it('rejects a non-string name', async () => {
    expect((await errorsFor({ name: 123 })).length).toBeGreaterThan(0);
  });
});
