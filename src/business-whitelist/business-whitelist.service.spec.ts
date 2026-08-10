import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessWhitelistService } from './business-whitelist.service';
import { WhitelistedNumber } from './business-whitelist.entity';

/**
 * Global, admin-managed business number whitelist — no per-user scoping.
 * Mobile syncs the active subset down via GET /business-whitelist/sync
 * and uses it natively to bypass call-screening/spam-blocking.
 */
describe('BusinessWhitelistService', () => {
  let service: BusinessWhitelistService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, active: true, createdAt: new Date(), updatedAt: new Date(), ...data })),
      remove: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessWhitelistService,
        { provide: getRepositoryToken(WhitelistedNumber), useValue: repo },
      ],
    }).compile();
    service = mod.get(BusinessWhitelistService);
  });

  describe('create', () => {
    it('rejects a duplicate number in a different format (normalized comparison)', async () => {
      repo.findOne.mockResolvedValue({ id: 1, phoneNumber: '+27721234567' });

      await expect(
        service.create({ phoneNumber: '072 123 4567' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a new whitelisted number, normalized and active', async () => {
      repo.findOne.mockResolvedValue(null);

      const w = await service.create({ phoneNumber: '072 123 4567', label: 'Acme Bank' } as any);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '+27721234567', label: 'Acme Bank', active: true }),
      );
      expect(w.active).toBe(true);
      expect(w.phoneNumber).toBe('+27721234567');
    });
  });

  describe('findAll', () => {
    it('lists all whitelisted numbers, newest first', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });

  describe('update', () => {
    it('re-normalizes phoneNumber when provided', async () => {
      repo.findOne.mockResolvedValue({ id: 1, phoneNumber: '+27721234567', active: true });
      repo.save.mockImplementation(async (data) => data);

      const updated = await service.update(1, { phoneNumber: '072 999 8888' } as any);

      expect(updated.phoneNumber).toBe('+27729998888');
    });

    it('throws NotFoundException when the id does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { active: false } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects updating to a number that duplicates another (normalized)', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 1, phoneNumber: '+27721234567', active: true }) // row being updated
        .mockResolvedValueOnce({ id: 2, phoneNumber: '+27729998888' }); // conflicting row

      await expect(
        service.update(1, { phoneNumber: '072 999 8888' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates active without requiring phoneNumber', async () => {
      repo.findOne.mockResolvedValue({ id: 1, phoneNumber: '+27721234567', active: true });
      repo.save.mockImplementation(async (data) => data);

      const updated = await service.update(1, { active: false } as any);

      expect(updated.active).toBe(false);
      expect(updated.phoneNumber).toBe('+27721234567');
    });
  });

  describe('remove', () => {
    it('hard deletes a whitelisted number by id', async () => {
      const row = { id: 1, phoneNumber: '+27721234567' };
      repo.findOne.mockResolvedValue(row);

      await service.remove(1);

      expect(repo.remove).toHaveBeenCalledWith(row);
    });

    it('throws NotFoundException when removing an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getActiveNumbers (device sync source)', () => {
    it('returns only active numbers, normalized', async () => {
      repo.find.mockResolvedValue([{ phoneNumber: '+27721234567' }, { phoneNumber: '+27729998888' }]);

      const numbers = await service.getActiveNumbers();

      expect(repo.find).toHaveBeenCalledWith({ where: { active: true } });
      expect(numbers).toEqual(['+27721234567', '+27729998888']);
    });
  });
});
