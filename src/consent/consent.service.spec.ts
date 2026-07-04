import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { ConsentService } from './consent.service';
import { UserConsent } from './user-consent.entity';

describe('ConsentService', () => {
  let service: ConsentService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      update: jest.fn(async () => ({ affected: 1 })),
      find: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: getRepositoryToken(UserConsent), useValue: repo },
      ],
    }).compile();
    service = mod.get(ConsentService);
  });

  describe('grant', () => {
    it('revokes any prior active consent of the same type, then records a new one with version + timestamp', async () => {
      const now = new Date('2026-06-22T00:00:00Z');
      const result = await service.grant(7, 'data_sharing', '1.0.0', now);

      // prior active rows are revoked
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 7, consentType: 'data_sharing', revokedAt: IsNull() },
        { revokedAt: now },
      );
      // new active consent saved
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        userId: 7,
        consentType: 'data_sharing',
        version: '1.0.0',
        grantedAt: now,
        revokedAt: null,
      }));
      expect(result.version).toBe('1.0.0');
    });
  });

  describe('revoke', () => {
    it('marks active consents of the type as revoked', async () => {
      const now = new Date('2026-06-23T00:00:00Z');
      repo.update.mockResolvedValue({ affected: 2 });
      const res = await service.revoke(7, 'data_sharing', now);
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 7, consentType: 'data_sharing', revokedAt: IsNull() },
        { revokedAt: now },
      );
      expect(res).toEqual({ revoked: 2 });
    });
  });

  describe('hasActiveConsent', () => {
    it('is true when an un-revoked consent exists', async () => {
      repo.count.mockResolvedValue(1);
      await expect(service.hasActiveConsent(7, 'data_sharing')).resolves.toBe(true);
      expect(repo.count).toHaveBeenCalledWith({
        where: { userId: 7, consentType: 'data_sharing', revokedAt: IsNull() },
      });
    });

    it('is false when none exists', async () => {
      repo.count.mockResolvedValue(0);
      await expect(service.hasActiveConsent(7, 'data_sharing')).resolves.toBe(false);
    });
  });

  describe('getActive', () => {
    it('returns the user’s active (un-revoked) consents', async () => {
      await service.getActive(7);
      expect(repo.find).toHaveBeenCalledWith({ where: { userId: 7, revokedAt: IsNull() } });
    });
  });
});
