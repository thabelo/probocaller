import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportedSmsService } from './reported-sms.service';
import { ReportedSms, ReportStatus } from './reported-sms.entity';

describe('ReportedSmsService', () => {
  let service: ReportedSmsService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save:   jest.fn(async (x) => ({ id: 1, createdAt: new Date(), status: 'pending', ...x })),
      find:   jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ReportedSmsService,
        { provide: getRepositoryToken(ReportedSms), useValue: repo },
      ],
    }).compile();
    service = mod.get(ReportedSmsService);
  });

  describe('report', () => {
    it('persists a report with reporter, sender, body, reason — status defaults to pending', async () => {
      await service.report(42, {
        sender: '+27999',
        body: 'Win a prize!',
        reason: 'scam',
        userNote: 'classic phishing',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        reporterUserId: 42,
        sender: '+27999',
        body: 'Win a prize!',
        reason: 'scam',
        userNote: 'classic phishing',
        status: 'pending',
      }));
    });

    it('rejects empty sender', async () => {
      await expect(
        service.report(1, { sender: '  ', body: 'x', reason: 'spam' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty body', async () => {
      await expect(
        service.report(1, { sender: '+1', body: '', reason: 'spam' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid reason', async () => {
      await expect(
        service.report(1, { sender: '+1', body: 'x', reason: 'not-a-reason' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('truncates body to 1600 chars (3 standard SMS pages)', async () => {
      const long = 'A'.repeat(5000);
      await service.report(1, { sender: '+1', body: long, reason: 'spam' });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.body.length).toBe(1600);
    });
  });

  describe('listForAdmin', () => {
    it('returns rows ordered by createdAt DESC, default limit 50', async () => {
      await service.listForAdmin();
      expect(repo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });

    it('filters by status when provided', async () => {
      await service.listForAdmin({ status: 'pending' });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'pending' },
      }));
    });

    it('clamps limit to hard max 500', async () => {
      await service.listForAdmin({ limit: 10_000 });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });
  });

  describe('updateStatus', () => {
    it('marks a report as confirmed with reviewer + notes + timestamp', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 7, status: 'pending' });
      const beforeTs = Date.now();
      await service.updateStatus(99, 7, { status: 'confirmed', adminNotes: 'real scam' });
      expect(repo.update).toHaveBeenCalledTimes(1);
      const [where, patch] = repo.update.mock.calls[0];
      expect(where).toEqual({ id: 7 });
      expect(patch).toEqual(expect.objectContaining({
        status: 'confirmed',
        reviewedBy: 99,
        adminNotes: 'real scam',
      }));
      expect(patch.reviewedAt).toBeInstanceOf(Date);
      expect(patch.reviewedAt.getTime()).toBeGreaterThanOrEqual(beforeTs);
    });

    it('rejects invalid status', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 7, status: 'pending' });
      await expect(
        service.updateStatus(99, 7, { status: 'maybe' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the report id is unknown', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.updateStatus(99, 9999, { status: 'confirmed' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('countBySender', () => {
    it('counts non-dismissed reports for the (trimmed) sender', async () => {
      repo.count = jest.fn(async () => 3);
      const n = await service.countBySender('  +27999  ');
      expect(n).toBe(3);
      expect(repo.count).toHaveBeenCalledWith({
        where: { sender: '+27999', status: Not('dismissed') },
      });
    });

    it('returns 0 for a blank sender without hitting the repo', async () => {
      repo.count = jest.fn(async () => 0);
      const n = await service.countBySender('   ');
      expect(n).toBe(0);
      expect(repo.count).not.toHaveBeenCalled();
    });
  });
});
