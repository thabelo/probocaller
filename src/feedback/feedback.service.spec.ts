import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { Feedback } from './feedback.entity';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), status: 'open', ...x })),
      find: jest.fn(async () => []),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getRepositoryToken(Feedback), useValue: repo },
      ],
    }).compile();
    service = mod.get(FeedbackService);
  });

  describe('submit', () => {
    it('persists feedback with reporter, category, message — status defaults to open', async () => {
      await service.submit(42, {
        category: 'bug',
        message: 'The call screen crashes on answer',
        appVersion: '1.2.3',
        platform: 'android',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        userId: 42,
        category: 'bug',
        message: 'The call screen crashes on answer',
        appVersion: '1.2.3',
        platform: 'android',
        status: 'open',
      }));
    });

    it('rejects an empty message', async () => {
      await expect(
        service.submit(1, { category: 'bug', message: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid category', async () => {
      await expect(
        service.submit(1, { category: 'nonsense' as any, message: 'hi' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('truncates an over-long message to 3000 chars', async () => {
      await service.submit(1, { category: 'other', message: 'A'.repeat(9000) });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.message.length).toBe(3000);
    });
  });

  describe('listForAdmin', () => {
    it('returns rows ordered by createdAt DESC, default limit 50', async () => {
      await service.listForAdmin();
      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' }, take: 50 });
    });

    it('filters by status and clamps limit to 500', async () => {
      await service.listForAdmin({ status: 'open', limit: 10_000 });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'open' },
        take: 500,
      }));
    });
  });
});
