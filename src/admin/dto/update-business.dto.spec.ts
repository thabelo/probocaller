import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateBusinessDto } from './update-business.dto';

// Mirrors the global ValidationPipe (main.ts): whitelist + forbidNonWhitelisted,
// so these tests catch the same "property X should not exist" rejections the
// real admin API would return.
const errorsFor = async (obj: any) =>
  validate(plainToInstance(AdminUpdateBusinessDto, obj), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('AdminUpdateBusinessDto', () => {
  it('accepts every field the mobile app collects at registration, including country', async () => {
    expect(
      await errorsFor({
        companyName: 'Acme Corp',
        industry: 'Technology',
        registrationNumber: '2026/012345/07',
        country: 'ZA',
        website: 'https://acme.test',
        contactEmail: 'hello@acme.test',
        contactPhone: '+27821234567',
        address: '123 Main Street',
        description: 'A test business',
      }),
    ).toHaveLength(0);
  });

  it('accepts blank optional website/contactEmail (the admin form always sends every field)', async () => {
    // The Edit Profile form pre-fills every optional field with '' when the
    // business was registered without one; saving without touching them must
    // not 400 with an IsUrl/IsEmail format error.
    expect(await errorsFor({ companyName: 'Acme Corp', website: '', contactEmail: '' })).toHaveLength(0);
  });

  it('rejects a malformed website or email when a real value is supplied', async () => {
    expect((await errorsFor({ website: 'not-a-url' })).length).toBeGreaterThan(0);
    expect((await errorsFor({ contactEmail: 'not-an-email' })).length).toBeGreaterThan(0);
  });

  it('rejects an unknown property (mass-assignment protection stays intact)', async () => {
    expect((await errorsFor({ walletBalance: 999999 })).length).toBeGreaterThan(0);
  });

  it('accepts an absent country and rejects an obviously invalid one', async () => {
    expect(await errorsFor({ companyName: 'Acme Corp' })).toHaveLength(0);
    expect((await errorsFor({ country: 'South Africa' })).length).toBeGreaterThan(0);
  });
});

/**
 * The admin edit form has to be able to fix a business's logo.
 *
 * Registration now requires one, and twelve businesses predate that rule with
 * no logo at all — an admin is the only one who can correct those. This DTO is
 * a strict allow-list under forbidNonWhitelisted, so a field it omits is not
 * merely ignored: the request is rejected outright.
 */
describe('AdminUpdateBusinessDto — the logo is editable', () => {
  it('accepts a logo URL', async () => {
    expect(await errorsFor({ logoUrl: '/business/logo/abc.png' })).toHaveLength(0);
  });

  it('accepts a full URL to an externally hosted logo', async () => {
    expect(await errorsFor({ logoUrl: 'https://acme.co/logo.png' })).toHaveLength(0);
  });

  /** The service refuses a blank one; the DTO must let it through to be judged. */
  it('lets a blank value reach the service, which is what rejects it', async () => {
    expect(await errorsFor({ logoUrl: '' })).toHaveLength(0);
  });
});
