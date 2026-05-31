import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SmsDeletionLogService } from './sms-deletion-log.service';
import { SmsDeletionLog } from './sms-deletion-log.entity';

describe('SmsDeletionLogService', () => {
  let service: SmsDeletionLogService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save:   jest.fn(async (x) => ({ id: 1, deletedAt: new Date(), ...x })),
      find:   jest.fn(async () => []),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeletionLogService,
        { provide: getRepositoryToken(SmsDeletionLog), useValue: repo },
      ],
    }).compile();
    service = mod.get(SmsDeletionLogService);
  });

  describe('log — metadata only (default, both settings off)', () => {
    it('persists sender + pattern + matchedText without body fields', async () => {
      await service.log(7, {
        sender: '+27123456789',
        matchedPattern: 'otp',
        matchedText: 'OTP',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        userId: 7,
        sender: '+27123456789',
        matchedPattern: 'otp',
        matchedText: 'OTP',
      }));
      expect(saved.bodyEncrypted).toBeFalsy();
      expect(saved.iv).toBeFalsy();
    });
  });

  describe('log — encrypted backup', () => {
    it('persists bodyEncrypted + iv when supplied', async () => {
      await service.log(7, {
        sender: '+1',
        matchedPattern: 'x',
        bodyEncrypted: 'opaque-ct.mac',
        iv: 'opaque-iv',
      });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.bodyEncrypted).toBe('opaque-ct.mac');
      expect(saved.iv).toBe('opaque-iv');
    });

    it('rejects when bodyEncrypted is present but iv is missing', async () => {
      await expect(
        service.log(7, { sender: '+1', matchedPattern: 'x', bodyEncrypted: 'ct' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when iv is present but bodyEncrypted is missing', async () => {
      await expect(
        service.log(7, { sender: '+1', matchedPattern: 'x', iv: 'iv' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('log — privacy guards (reject plaintext)', () => {
    it('rejects when caller sends a `body` field', async () => {
      await expect(
        service.log(7, { sender: '+1', matchedPattern: 'x', body: 'plaintext' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when caller sends a `bodySnippet` field', async () => {
      await expect(
        service.log(7, { sender: '+1', matchedPattern: 'x', bodySnippet: 'plaintext' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('log — required fields', () => {
    it('rejects empty sender', async () => {
      await expect(
        service.log(1, { sender: '   ', matchedPattern: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects empty pattern', async () => {
      await expect(
        service.log(1, { sender: '+1', matchedPattern: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAll', () => {
    it('queries by userId, reverse-chronological, default limit 100', async () => {
      await service.getAll(42);
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 42 },
        order: { deletedAt: 'DESC' },
        take: 100,
      });
    });
    it('clamps limit to hard maximum of 500', async () => {
      await service.getAll(42, 10_000);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });
    it('clamps non-positive limit to 1', async () => {
      await service.getAll(42, 0);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    });
  });

  describe('clear', () => {
    it('deletes all rows for the user and returns affected count', async () => {
      repo.delete.mockResolvedValueOnce({ affected: 3 });
      expect(await service.clear(7)).toBe(3);
      expect(repo.delete).toHaveBeenCalledWith({ userId: 7 });
    });
    it('returns 0 when affected is undefined', async () => {
      repo.delete.mockResolvedValueOnce({});
      expect(await service.clear(7)).toBe(0);
    });
  });
});
