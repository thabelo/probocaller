import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan } from 'typeorm';
import { DataRetentionService } from './data-retention.service';
import { CallLog } from '../call/call.entity';
import { AuditLog } from '../audit/audit-log.entity';

const DAY = 24 * 60 * 60 * 1000;

describe('DataRetentionService', () => {
  let service: DataRetentionService;
  let callRepo: any;
  let auditRepo: any;

  beforeEach(async () => {
    callRepo = { delete: jest.fn(async () => ({ affected: 3 })) };
    auditRepo = { delete: jest.fn(async () => ({ affected: 5 })) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DataRetentionService,
        { provide: getRepositoryToken(CallLog), useValue: callRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepo },
      ],
    }).compile();
    service = mod.get(DataRetentionService);
  });

  afterEach(() => {
    delete process.env.CALL_LOG_RETENTION_DAYS;
    delete process.env.AUDIT_LOG_RETENTION_DAYS;
  });

  it('purges call logs older than 365d and audit logs older than 730d by default', async () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const res = await service.purgeExpired(now);

    expect(callRepo.delete).toHaveBeenCalledWith({ startedAt: LessThan(new Date(now.getTime() - 365 * DAY)) });
    expect(auditRepo.delete).toHaveBeenCalledWith({ createdAt: LessThan(new Date(now.getTime() - 730 * DAY)) });
    expect(res).toEqual({ callLogs: 3, auditLogs: 5 });
  });

  it('honours env-configured retention windows', async () => {
    process.env.CALL_LOG_RETENTION_DAYS = '30';
    const now = new Date('2026-06-22T00:00:00Z');
    await service.purgeExpired(now);
    expect(callRepo.delete).toHaveBeenCalledWith({ startedAt: LessThan(new Date(now.getTime() - 30 * DAY)) });
  });
});
