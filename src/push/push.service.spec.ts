import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PushService } from './push.service';
import { PushProvider } from './push.provider';
import { DeviceToken } from './device-token.entity';

/**
 * Server-side push delivery. The RN app already renders notifications it is
 * handed (appNotificationWiring); what was missing is the SEND half — knowing
 * which devices a user has, and pushing to them.
 *
 * The concrete transport (FCM) is a pluggable provider, same seam as
 * TranscriptionProvider, so the pipeline is testable and shippable before the
 * Firebase project/credentials exist.
 */
describe('PushService', () => {
  let service: PushService;
  let repo: any;
  let provider: { send: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => ({ id: 1, ...d })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    provider = { send: jest.fn().mockResolvedValue({ delivered: true }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getRepositoryToken(DeviceToken), useValue: repo },
        { provide: PushProvider, useValue: provider },
      ],
    }).compile();
    service = module.get(PushService);
  });

  describe('registerDevice', () => {
    it('stores a new device token for the user', async () => {
      await service.registerDevice(7, 'tok-abc', 'android');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7, token: 'tok-abc', platform: 'android' }),
      );
    });

    // Re-registering happens on every app start and after every token refresh.
    // Inserting a row each time would fan one push out into hundreds of sends.
    it('is idempotent — re-registering the same token does not duplicate it', async () => {
      repo.findOne.mockResolvedValue({ id: 3, userId: 7, token: 'tok-abc', platform: 'android' });
      await service.registerDevice(7, 'tok-abc', 'android');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, userId: 7 }));
      expect(repo.create).not.toHaveBeenCalled();
    });

    // A token is a device, not a person: on a shared or resold handset it must
    // follow the account that registered it last, or pushes leak to the wrong user.
    it('reassigns a token that was previously registered to another user', async () => {
      repo.findOne.mockResolvedValue({ id: 3, userId: 99, token: 'tok-abc', platform: 'android' });
      await service.registerDevice(7, 'tok-abc', 'android');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, userId: 7 }));
    });

    it('rejects a blank token rather than storing an unusable row', async () => {
      await expect(service.registerDevice(7, '   ', 'android')).rejects.toThrow(/token/i);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('unregisterDevice', () => {
    it('removes the token so a signed-out device stops receiving pushes', async () => {
      await service.unregisterDevice(7, 'tok-abc');
      expect(repo.delete).toHaveBeenCalledWith({ userId: 7, token: 'tok-abc' });
    });
  });

  describe('sendToUser', () => {
    it('pushes to every device the user has registered', async () => {
      repo.find.mockResolvedValue([
        { token: 'tok-1', platform: 'android' },
        { token: 'tok-2', platform: 'android' },
      ]);
      const res = await service.sendToUser(7, { title: 'You got paid', body: 'R9.69 from Acme' });
      expect(provider.send).toHaveBeenCalledTimes(2);
      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'tok-1', title: 'You got paid', body: 'R9.69 from Acme' }),
      );
      expect(res).toEqual({ sent: 2, failed: 0 });
    });

    it('no-ops for a user with no registered devices', async () => {
      repo.find.mockResolvedValue([]);
      const res = await service.sendToUser(7, { title: 'x', body: 'y' });
      expect(provider.send).not.toHaveBeenCalled();
      expect(res).toEqual({ sent: 0, failed: 0 });
    });

    // Push is a side effect of things like "you got paid" — a dead token or a
    // provider outage must never fail the money path that triggered it.
    it('never throws when the provider fails, and reports the failure count', async () => {
      repo.find.mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }]);
      provider.send
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValueOnce({ delivered: true });
      const res = await service.sendToUser(7, { title: 'x', body: 'y' });
      expect(res).toEqual({ sent: 1, failed: 1 });
    });

    // FCM reports permanently-dead tokens; keeping them means every future send
    // wastes a call and the failure count never recovers.
    it('prunes a token the provider reports as permanently invalid', async () => {
      repo.find.mockResolvedValue([{ token: 'tok-dead' }]);
      provider.send.mockResolvedValue({ delivered: false, invalidToken: true });
      await service.sendToUser(7, { title: 'x', body: 'y' });
      expect(repo.delete).toHaveBeenCalledWith({ token: 'tok-dead' });
    });

    it('passes routing data through so a tap opens the right screen', async () => {
      repo.find.mockResolvedValue([{ token: 'tok-1' }]);
      await service.sendToUser(7, { title: 'x', body: 'y', data: { kind: 'earning', target: '+27820001111' } });
      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: { kind: 'earning', target: '+27820001111' } }),
      );
    });
  });
});
