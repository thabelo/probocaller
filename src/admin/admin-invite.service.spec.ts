import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminInviteService } from './admin-invite.service';
import { AdminInvite } from './admin-invite.entity';
import { User } from '../user/user.entity';

describe('AdminInviteService', () => {
  let service: AdminInviteService;
  let inviteRepo: any;
  let userRepo: any;

  beforeEach(async () => {
    inviteRepo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
    };
    userRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (x) => x),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInviteService,
        { provide: getRepositoryToken(AdminInvite), useValue: inviteRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = mod.get(AdminInviteService);
  });

  describe('create', () => {
    it('creates a pending invite with a generated token and a future expiry', async () => {
      const now = new Date('2026-06-22T00:00:00Z');
      const invite = await service.create(7, { phoneNumber: '+27821234567' }, { now });
      expect(inviteRepo.save).toHaveBeenCalledTimes(1);
      const saved = inviteRepo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        phoneNumber: '+27821234567',
        role: 'admin',
        invitedByUserId: 7,
        status: 'pending',
      }));
      expect(typeof saved.token).toBe('string');
      expect(saved.token.length).toBeGreaterThan(16);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(invite.token).toBe(saved.token);
    });

    it('rejects a blank phone number', async () => {
      await expect(service.create(7, { phoneNumber: '   ' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('redeem', () => {
    const pendingInvite = () => ({
      id: 3,
      phoneNumber: '+27821234567',
      token: 'tok123',
      role: 'admin',
      status: 'pending',
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      redeemedAt: null,
    });

    it('promotes the matching user to admin and marks the invite redeemed', async () => {
      const now = new Date('2026-06-23T00:00:00Z');
      inviteRepo.findOne.mockResolvedValue(pendingInvite());
      userRepo.findOne.mockResolvedValue({ id: 9, phoneNumber: '+27821234567', role: 'user' });

      const result = await service.redeem('tok123', 9, { now });

      const savedUser = userRepo.save.mock.calls[0][0];
      expect(savedUser.role).toBe('admin');
      const savedInvite = inviteRepo.save.mock.calls[0][0];
      expect(savedInvite.status).toBe('redeemed');
      expect(savedInvite.redeemedAt).toBeInstanceOf(Date);
      expect(result.role).toBe('admin');
    });

    it('rejects an unknown token', async () => {
      inviteRepo.findOne.mockResolvedValue(null);
      await expect(service.redeem('nope', 9)).rejects.toThrow(NotFoundException);
    });

    it('rejects an already-redeemed invite', async () => {
      inviteRepo.findOne.mockResolvedValue({ ...pendingInvite(), status: 'redeemed' });
      await expect(service.redeem('tok123', 9)).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired invite', async () => {
      inviteRepo.findOne.mockResolvedValue({ ...pendingInvite(), expiresAt: new Date('2026-01-01T00:00:00Z') });
      userRepo.findOne.mockResolvedValue({ id: 9, phoneNumber: '+27821234567', role: 'user' });
      await expect(
        service.redeem('tok123', 9, { now: new Date('2026-06-23T00:00:00Z') }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids redeeming from a user whose phone does not match the invite', async () => {
      inviteRepo.findOne.mockResolvedValue(pendingInvite());
      userRepo.findOne.mockResolvedValue({ id: 9, phoneNumber: '+27110000000', role: 'user' });
      await expect(
        service.redeem('tok123', 9, { now: new Date('2026-06-23T00:00:00Z') }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('returns invites ordered by createdAt DESC', async () => {
      await service.list();
      expect(inviteRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' }, take: 100 });
    });
  });
});
