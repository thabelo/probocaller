import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SpamReportService } from './spam-report.service';
import { SpamReport } from './spam-report.entity';

describe('SpamReportService — shared spam DB contributions (no plaintext)', () => {
  let service: SpamReportService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save:   jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      find:   jest.fn(async () => []),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SpamReportService,
        { provide: getRepositoryToken(SpamReport), useValue: repo },
      ],
    }).compile();
    service = mod.get(SpamReportService);
  });

  describe('report', () => {
    it('persists senderHash + bodyHash + matchedPattern + userId', async () => {
      await service.report(7, {
        senderHash: 'a'.repeat(64),
        bodyHash:   'b'.repeat(64),
        matchedPattern: 'otp',
      });
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        userId: 7,
        senderHash: 'a'.repeat(64),
        bodyHash:   'b'.repeat(64),
        matchedPattern: 'otp',
      }));
    });

    it('rejects when senderHash is not a 64-char hex digest', async () => {
      await expect(
        service.report(7, { senderHash: 'short', bodyHash: 'b'.repeat(64), matchedPattern: 'x' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.report(7, { senderHash: 'Z'.repeat(64), bodyHash: 'b'.repeat(64), matchedPattern: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when bodyHash is not a 64-char hex digest', async () => {
      await expect(
        service.report(7, { senderHash: 'a'.repeat(64), bodyHash: '!!!', matchedPattern: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty matchedPattern', async () => {
      await expect(
        service.report(7, { senderHash: 'a'.repeat(64), bodyHash: 'b'.repeat(64), matchedPattern: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any plaintext fields (sender, body, message, text, phoneNumber)', async () => {
      const base = { senderHash: 'a'.repeat(64), bodyHash: 'b'.repeat(64), matchedPattern: 'x' };
      for (const field of ['sender', 'body', 'message', 'text', 'phoneNumber'] as const) {
        await expect(
          service.report(7, { ...base, [field]: 'leak' } as any),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('getRecent', () => {
    it('returns the most recent reports, capped at limit', async () => {
      await service.getRecent(50);
      expect(repo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });
    it('clamps limit to hard maximum 1000', async () => {
      await service.getRecent(99_999);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1000 }));
    });
  });
});
