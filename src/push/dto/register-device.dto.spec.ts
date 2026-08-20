import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDeviceDto, UnregisterDeviceDto } from './register-device.dto';

const errorsFor = async (cls: any, payload: any) =>
  (await validate(plainToInstance(cls, payload))).map((e) => e.property);

describe('RegisterDeviceDto', () => {
  it('accepts a token with an explicit platform', async () => {
    expect(await errorsFor(RegisterDeviceDto, { token: 'tok-abc', platform: 'ios' })).toEqual([]);
  });

  it('accepts a token with no platform (the service defaults it)', async () => {
    expect(await errorsFor(RegisterDeviceDto, { token: 'tok-abc' })).toEqual([]);
  });

  // A blank token would register a row that can never receive a push.
  it('rejects a missing or empty token', async () => {
    expect(await errorsFor(RegisterDeviceDto, {})).toContain('token');
    expect(await errorsFor(RegisterDeviceDto, { token: '' })).toContain('token');
  });

  it('rejects an unknown platform rather than storing it', async () => {
    expect(await errorsFor(RegisterDeviceDto, { token: 'tok-abc', platform: 'blackberry' })).toContain('platform');
  });
});

describe('UnregisterDeviceDto', () => {
  it('requires the token to unregister', async () => {
    expect(await errorsFor(UnregisterDeviceDto, {})).toContain('token');
    expect(await errorsFor(UnregisterDeviceDto, { token: 'tok-abc' })).toEqual([]);
  });
});
