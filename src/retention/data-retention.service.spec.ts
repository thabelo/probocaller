import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan } from 'typeorm';
import { DataRetentionService } from './data-retention.service';
import { CallLog } from '../call/call.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { DataSource, LessThan as Older } from 'typeorm';
import { ProfileChangeLog } from '../profile/profile-change-log.entity';

const DAY = 24 * 60 * 60 * 1000;

describe('DataRetentionService', () => {
  let service: DataRetentionService;
  let callRepo: any;
  let auditRepo: any;
  let query: jest.Mock;
  let changeLogRepo: any;

  beforeEach(async () => {
    callRepo = { delete: jest.fn(async () => ({ affected: 3 })) };
    auditRepo = { delete: jest.fn(async () => ({ affected: 5 })) };
    query = jest.fn(async () => [{ removed: 7 }]);
    changeLogRepo = { delete: jest.fn(async () => ({ affected: 4 })) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DataRetentionService,
        { provide: getRepositoryToken(CallLog), useValue: callRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepo },
        { provide: DataSource, useValue: { query } },
        { provide: getRepositoryToken(ProfileChangeLog), useValue: changeLogRepo },
      ],
    }).compile();
    service = mod.get(DataRetentionService);
  });

  afterEach(() => {
    delete process.env.CALL_LOG_RETENTION_DAYS;
    delete process.env.AUDIT_LOG_RETENTION_DAYS;
    delete process.env.SURVEY_ANSWER_RETENTION_DAYS;
    delete process.env.PROFILE_HISTORY_RETENTION_DAYS;
  });

  it('purges call logs older than 365d and audit logs older than 730d by default', async () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const res = await service.purgeExpired(now);

    expect(callRepo.delete).toHaveBeenCalledWith({ startedAt: LessThan(new Date(now.getTime() - 365 * DAY)) });
    expect(auditRepo.delete).toHaveBeenCalledWith({ createdAt: LessThan(new Date(now.getTime() - 730 * DAY)) });
    expect(res).toMatchObject({ callLogs: 3, auditLogs: 5 });
  });

  it('honours env-configured retention windows', async () => {
    process.env.CALL_LOG_RETENTION_DAYS = '30';
    const now = new Date('2026-06-22T00:00:00Z');
    await service.purgeExpired(now);
    expect(callRepo.delete).toHaveBeenCalledWith({ startedAt: LessThan(new Date(now.getTime() - 30 * DAY)) });
  });

  /**
   * Nothing has ever removed a survey answer. A closed survey's answers sit
   * forever — including free text a business has already read, and free text
   * from a survey that never reached the release threshold and so will never
   * be read by anyone at all. Holding narrative nobody may ever look at is
   * the clearest kind of data-minimisation failure.
   */
  describe('survey answers', () => {
    it('purges the answers of surveys that closed over a year ago', async () => {
      const now = new Date('2026-06-22T00:00:00Z');
      const res = await service.purgeExpired(now);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/delete from survey_answers/i);
      expect(params[0]).toEqual(new Date(now.getTime() - 365 * DAY));
      expect(res.surveyAnswers).toBe(7);
    });

    /**
     * The RESPONSE row survives. It carries what the person was paid and is
     * shown to them in their own history; it is a financial record, and it is
     * also what stops them being asked the same survey twice.
     */
    it('leaves the response rows alone, because they are the payment record', async () => {
      await service.purgeExpired(new Date('2026-06-22T00:00:00Z'));
      const sql = query.mock.calls.map(([s]: any[]) => s).join(' ');
      expect(sql).not.toMatch(/delete from survey_responses/i);
    });

    /** A survey still taking answers has not finished being read. */
    it('never touches a survey that is still live', async () => {
      await service.purgeExpired(new Date('2026-06-22T00:00:00Z'));
      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(/"status" IN \('closed', 'expired'\)/i);
    });

    it('honours an env-configured window', async () => {
      process.env.SURVEY_ANSWER_RETENTION_DAYS = '90';
      const now = new Date('2026-06-22T00:00:00Z');
      await service.purgeExpired(now);
      expect(query.mock.calls[0][1][0]).toEqual(new Date(now.getTime() - 90 * DAY));
    });

    /** One table failing must not strand the rest of the purge. */
    it('still reports the other tables when the answer purge fails', async () => {
      query.mockRejectedValue(new Error('locked'));
      const res = await service.purgeExpired(new Date('2026-06-22T00:00:00Z'));
      expect(res).toMatchObject({ callLogs: 3, auditLogs: 5, surveyAnswers: 0 });
    });
  });

  /**
   * A profile holds the current state; its history holds the trajectory, and
   * the trajectory says more — "household grew in March, income band rose
   * twice this year" are life events nobody handed over as such. It is kept
   * long enough to answer a question about a record and no longer.
   */
  describe('profile change history', () => {
    it('purges history older than two years by default', async () => {
      const now = new Date('2026-06-22T00:00:00Z');
      const res = await service.purgeExpired(now);

      expect(changeLogRepo.delete).toHaveBeenCalledWith({
        changedAt: Older(new Date(now.getTime() - 730 * DAY)),
      });
      expect(res.profileChanges).toBe(4);
    });

    it('honours an env-configured window', async () => {
      process.env.PROFILE_HISTORY_RETENTION_DAYS = '90';
      const now = new Date('2026-06-22T00:00:00Z');
      await service.purgeExpired(now);
      expect(changeLogRepo.delete).toHaveBeenCalledWith({
        changedAt: Older(new Date(now.getTime() - 90 * DAY)),
      });
    });
  });
});
