import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CallLog } from '../call/call.entity';
import { AuditLog } from '../audit/audit-log.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONCE_PER_DAY_MS = DAY_MS;

export interface PurgeResult {
  callLogs: number;
  auditLogs: number;
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

    const result = { callLogs: callRes.affected ?? 0, auditLogs: auditRes.affected ?? 0 };
    this.logger.log(`Data-retention purge removed ${result.callLogs} call logs, ${result.auditLogs} audit logs`);
    return result;
  }
}
