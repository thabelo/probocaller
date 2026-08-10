import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ScamKeywordService } from './scam-keyword.service';
import { ScamKeyword } from './scam-keyword.entity';

/**
 * Global, admin-managed scam keyword list — distinct from the per-user
 * BlockedKeyword feature. Mobile syncs the active subset down via
 * GET /scam-keywords/sync and merges it with on-device defaults.
 */
describe('ScamKeywordService', () => {
  let service: ScamKeywordService;
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
        ScamKeywordService,
        { provide: getRepositoryToken(ScamKeyword), useValue: repo },
      ],
    }).compile();
    service = mod.get(ScamKeywordService);
  });

  describe('create', () => {
    it('rejects a duplicate keyword case-insensitively', async () => {
      repo.findOne.mockResolvedValue({ id: 1, keyword: 'lottery winner' });

      await expect(service.create('Lottery Winner')).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a new keyword as active, trimmed', async () => {
      repo.findOne.mockResolvedValue(null);

      const kw = await service.create('  free bitcoin  ');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'free bitcoin', active: true }));
      expect(kw.active).toBe(true);
      expect(kw.keyword).toBe('free bitcoin');
    });
  });

  describe('findAll', () => {
    it('lists all keywords (active and inactive), newest first', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });

  describe('update', () => {
    it('partially updates keyword and/or active', async () => {
      repo.findOne.mockResolvedValue({ id: 1, keyword: 'old', active: true });
      repo.save.mockImplementation(async (data) => data);

      const updated = await service.update(1, { active: false });

      expect(updated.active).toBe(false);
      expect(updated.keyword).toBe('old');
    });

    it('throws NotFoundException when the keyword id does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { active: false })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects updating to a keyword that duplicates another (case-insensitive)', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 1, keyword: 'old', active: true }) // the row being updated
        .mockResolvedValueOnce({ id: 2, keyword: 'lottery winner' }); // conflicting row

      await expect(service.update(1, { keyword: 'Lottery Winner' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('hard deletes a keyword by id', async () => {
      const row = { id: 1, keyword: 'old' };
      repo.findOne.mockResolvedValue(row);

      await service.remove(1);

      expect(repo.remove).toHaveBeenCalledWith(row);
    });

    it('throws NotFoundException when removing an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getActiveKeywords (device sync source)', () => {
    it('returns only active keyword strings', async () => {
      repo.find.mockResolvedValue([{ keyword: 'foo' }, { keyword: 'bar' }]);

      const keywords = await service.getActiveKeywords();

      expect(repo.find).toHaveBeenCalledWith({ where: { active: true } });
      expect(keywords).toEqual(['foo', 'bar']);
    });
  });
});
