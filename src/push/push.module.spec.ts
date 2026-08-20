import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PushModule } from './push.module';
import { PushService } from './push.service';
import { PushProvider, NoopPushProvider } from './push.provider';
import { DeviceToken } from './device-token.entity';

/**
 * The module must actually PROVIDE what the service asks for — the unit tests
 * build PushService by hand and would pass even if the module supplied nothing,
 * leaving the app refusing to boot.
 */
describe('PushModule wiring', () => {
  const build = () =>
    Test.createTestingModule({ imports: [PushModule] })
      .overrideProvider(getRepositoryToken(DeviceToken))
      .useValue({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() })
      .compile();

  it('can construct PushService from the module definition', async () => {
    const moduleRef = await build();
    expect(moduleRef.get(PushService)).toBeInstanceOf(PushService);
  });

  // No FCM credentials configured yet, so the transport must fall back to the
  // honest no-op rather than failing to resolve at boot.
  it('falls back to the no-op transport when no push credentials are configured', async () => {
    const prev = process.env.FCM_SERVICE_ACCOUNT;
    delete process.env.FCM_SERVICE_ACCOUNT;
    try {
      const moduleRef = await build();
      expect(moduleRef.get(PushProvider)).toBeInstanceOf(NoopPushProvider);
    } finally {
      if (prev === undefined) delete process.env.FCM_SERVICE_ACCOUNT;
      else process.env.FCM_SERVICE_ACCOUNT = prev;
    }
  });
});
