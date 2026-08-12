import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAppDto } from './update-app.dto';

/**
 * The catalogue edit allow-list.
 *
 * The global ValidationPipe runs with forbidNonWhitelisted, so anything absent
 * from this DTO is rejected at the edge — which is the first of the two guards
 * stopping an admin from renaming an app `key` and orphaning shipped screens.
 */
describe('UpdateAppDto', () => {
  const errorsFor = async (payload: object) =>
    validate(plainToInstance(UpdateAppDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts an edit to copy and status', async () => {
    expect(
      await errorsFor({ name: 'Paid Surveys', tagline: 'Get paid.', status: 'live' }),
    ).toEqual([]);
  });

  it('rejects a status outside the catalogue lifecycle', async () => {
    const errors = await errorsFor({ status: 'launched' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  /** Renaming a key would orphan the screens the mobile binary ships. */
  it('rejects an attempt to change the app key', async () => {
    const errors = await errorsFor({ key: 'something-else' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('key');
  });

  /** Audience is what the app fundamentally is, not how it is presented. */
  it('rejects an attempt to change the audience', async () => {
    const errors = await errorsFor({ audience: 'business' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('audience');
  });
});
