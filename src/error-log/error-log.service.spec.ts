import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';
import { ErrorLog } from './error-log.entity';

describe('ErrorLogService', () => {
  let service: ErrorLogService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      find: jest.fn(async () => []),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorLogService,
        { provide: getRepositoryToken(ErrorLog), useValue: repo },
      ],
    }).compile();
    service = mod.get(ErrorLogService);
  });

  describe('record', () => {
    it('persists an error with source, level, message, stack and context', async () => {
      await service.record({
        source: 'mobile',
        level: 'error',
        message: 'TypeError: cannot read x of undefined',
        stack: 'at CallerScreen.tsx:42',
        appVersion: '1.2.3',
        platform: 'android',
        context: { screen: 'CallerScreen' },
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        source: 'mobile',
        level: 'error',
        message: 'TypeError: cannot read x of undefined',
        stack: 'at CallerScreen.tsx:42',
        appVersion: '1.2.3',
        platform: 'android',
        context: { screen: 'CallerScreen' },
      }));
    });

    it('rejects an empty message', async () => {
      await expect(
        service.record({ source: 'mobile', level: 'error', message: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid level', async () => {
      await expect(
        service.record({ source: 'mobile', level: 'catastrophic' as any, message: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid source', async () => {
      await expect(
        service.record({ source: 'toaster' as any, level: 'error', message: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('truncates over-long message and stack', async () => {
      await service.record({
        source: 'web',
        level: 'error',
        message: 'M'.repeat(9000),
        stack: 'S'.repeat(90_000),
      });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.message.length).toBe(2000);
      expect(saved.stack.length).toBe(20_000);
    });

    it('defaults level to error when omitted', async () => {
      await service.record({ source: 'mobile', message: 'boom' } as any);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.level).toBe('error');
    });
  });

  describe('list', () => {
    it('returns rows ordered by createdAt DESC, default limit 100', async () => {
      await service.list();
      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' }, take: 100 });
    });

    it('filters by level and source and clamps limit to 500', async () => {
      await service.list({ level: 'error', source: 'mobile', limit: 10_000 });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { level: 'error', source: 'mobile' },
        take: 500,
      }));
    });
  });
});
