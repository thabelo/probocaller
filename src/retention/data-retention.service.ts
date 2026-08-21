import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { CallLog } from '../call/call.entity';
import { AuditLog } from '../audit/audit-log.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONCE_PER_DAY_MS = DAY_MS;

export interface PurgeResult {
  callLogs: number;
  auditLogs: number;
  surveyAnswers: number;
}

/**
 * Deletes operational data past its retention window so the database doesn't
 * grow unbounded and we don't hold personal call/audit data longer than needed.
 * Runs daily (interval scheduled at module init) and is also exposed to admins
 * for an on-demand purge. The window is env-configurable per table.
 */
@Injectable()
export class DataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(CallLog)
    private readonly callLogs: Repository<CallLog>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    // Don't spin a timer in tests; unit tests call purgeExpired directly.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.purgeExpired().catch((err) =>
        this.logger.error('Scheduled data-retention purge failed', err as Error),
      );
    }, ONCE_PER_DAY_MS);
    // Don't keep the process alive solely for this timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private days(envKey: string, fallback: number): number {
    const raw = parseInt(process.env[envKey] ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  async purgeExpired(now: Date = new Date()): Promise<PurgeResult> {
    const callCutoff = new Date(now.getTime() - this.days('CALL_LOG_RETENTION_DAYS', 365) * DAY_MS);
    const auditCutoff = new Date(now.getTime() - this.days('AUDIT_LOG_RETENTION_DAYS', 730) * DAY_MS);

    const callRes = await this.callLogs.delete({ startedAt: LessThan(callCutoff) });
    const auditRes = await this.auditLogs.delete({ createdAt: LessThan(auditCutoff) });
    const surveyAnswers = await this.purgeSurveyAnswers(now);

    const result = {
      callLogs: callRes.affected ?? 0,
      auditLogs: auditRes.affected ?? 0,
      surveyAnswers,
    };
    this.logger.log(
      `Data-retention purge removed ${result.callLogs} call logs, ${result.auditLogs} audit logs, ${result.surveyAnswers} survey answers`,
    );
    return result;
  }

  /**
   * Drop the ANSWERS of surveys that finished long ago.
   *
   * Nothing has ever removed one. A closed survey's answers sit forever —
   * including free text a business has already read, and free text from a
   * survey that never reached the release threshold and so will never be read
   * by anybody at all. Keeping narrative nobody may ever look at is the
   * plainest kind of data-minimisation failure, and it is pure breach
   * liability.
   *
   * The RESPONSE row survives deliberately. It carries what the person was
   * paid, it is shown back to them in their own history, and it is what stops
   * them being asked the same survey twice. Money and de-duplication are not
   * the sensitive part; the answers are.
   *
   * Terminal surveys only — a live one has not finished being read — and a
   * generous default, because the business paid for these answers and the
   * results endpoint reads them.
   */
  private async purgeSurveyAnswers(now: Date): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.days('SURVEY_ANSWER_RETENTION_DAYS', 365) * DAY_MS,
    );

    try {
      const rows = await this.dataSource.query(
        `WITH removed AS (
           DELETE FROM survey_answers a
            WHERE a."responseId" IN (
                  SELECT r."id" FROM survey_responses r
                    JOIN surveys s ON s."id" = r."surveyId"
                   WHERE s."status" IN ('closed', 'expired')
                     AND s."closedAt" < $1)
          RETURNING 1)
         SELECT COUNT(*)::int AS removed FROM removed`,
        [cutoff],
      );
      return Number(rows?.[0]?.removed ?? 0);
    } catch (error) {
      // One table failing must not strand the rest of the purge — the call and
      // audit deletes have already run by this point.
      this.logger.error(`Survey answer purge failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
