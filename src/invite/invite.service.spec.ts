import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { InviteService } from './invite.service';
import { Invite } from './invite.entity';
import { User } from '../user/user.entity';

describe('InviteService', () => {
  let service: InviteService;
  let repo: any;
  let users: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    users = { findOne: jest.fn(async () => ({ id: 42, phoneNumber: '+27821110000', referralCode: 'PROBO-ME' })) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        { provide: getRepositoryToken(Invite), useValue: repo },
        { provide: getRepositoryToken(User), useValue: users },
      ],
    }).compile();
    service = mod.get(InviteService);
  });

  describe('record', () => {
    it('saves the invite against the inviter with status sent', async () => {
      await service.record(42, { phoneNumber: '082 114 0092' });
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(
        expect.objectContaining({ inviterUserId: 42, status: 'sent', channel: 'sms' }),
      );
    });

    /**
     * Signup matches on the canonical number, so an invite stored as typed
     * ("082…") would never be found when the invitee joins as +27….
     */
    it('normalises the invited number to E.164', async () => {
      await service.record(42, { phoneNumber: '082 114 0092' });
      expect(repo.save.mock.calls[0][0].phoneNumber).toBe('+27821140092');
    });

    it('stamps the inviter own referral code so the link is attributable', async () => {
      await service.record(42, { phoneNumber: '0821140092' });
      expect(repo.save.mock.calls[0][0].referralCode).toBe('PROBO-ME');
    });

    it('rejects a missing number', async () => {
      await expect(service.record(42, { phoneNumber: '  ' })).rejects.toBeInstanceOf(BadRequestException);
    });

    /** Inviting yourself would mint a self-referral and a 3% loop. */
    it('rejects inviting your own number', async () => {
      await expect(service.record(42, { phoneNumber: '+27821110000' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    /**
     * Re-inviting is a normal thing to do (a nudge). It must refresh the existing
     * row, not create a second one — the admin view counts people, not attempts.
     */
    it('refreshes an existing invite instead of duplicating it', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 7, inviterUserId: 42, phoneNumber: '+27821140092', status: 'sent' });
      await service.record(42, { phoneNumber: '0821140092' });
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save.mock.calls[0][0].id).toBe(7);
    });

    /** A nudge must not un-accept someone who already joined. */
    it('leaves an already-accepted invite accepted', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 7, inviterUserId: 42, phoneNumber: '+27821140092', status: 'accepted' });
      await service.record(42, { phoneNumber: '0821140092' });
      expect(repo.save.mock.calls[0][0].status).toBe('accepted');
    });
  });

  describe('markAccepted', () => {
    it('flips a pending invite for that number to accepted', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 9, phoneNumber: '+27821140092', status: 'sent' });
      await service.markAccepted('082 114 0092');
      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('accepted');
      expect(saved.acceptedAt).toBeInstanceOf(Date);
    });

    it('is a no-op when nobody invited that number', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await service.markAccepted('+27829999999');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('listForAdmin', () => {
    it('returns newest first', async () => {
      await service.listForAdmin();
      expect(repo.find.mock.calls[0][0].order).toEqual({ createdAt: 'DESC' });
    });

    it('filters by status when asked', async () => {
      await service.listForAdmin({ status: 'accepted' });
      expect(repo.find.mock.calls[0][0].where).toEqual({ status: 'accepted' });
    });

    it('clamps the limit so one request cannot pull the whole table', async () => {
      await service.listForAdmin({ limit: 100000 });
      expect(repo.find.mock.calls[0][0].take).toBeLessThanOrEqual(500);
    });
  });
});
