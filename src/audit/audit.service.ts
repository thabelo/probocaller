import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export type AuditEntry = {
  actorUserId?: number | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  metadata?: unknown;
  ip?: string;
};

export type AuditFilter = {
  action?: string;
  actorUserId?: number;
  targetType?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 500;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Append an audit entry. Deliberately swallows persistence errors — failing to
   * write an audit row must never break the business action it is recording.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const row = this.repo.create({
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId != null ? String(entry.targetId) : undefined,
        metadata: entry.metadata !== undefined ? JSON.stringify(entry.metadata) : undefined,
        ip: entry.ip,
      });
      await this.repo.save(row);
    } catch (err) {
      this.logger.error(`Failed to write audit log for "${entry.action}"`, err as Error);
    }
  }

  list(filter: AuditFilter = {}): Promise<AuditLog[]> {
    const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const where: Record<string, unknown> = {};
    if (filter.action) where.action = filter.action;
    if (filter.actorUserId !== undefined) where.actorUserId = filter.actorUserId;
    if (filter.targetType) where.targetType = filter.targetType;

    const opts: any = { order: { createdAt: 'DESC' }, take };
    if (Object.keys(where).length > 0) opts.where = where;
    return this.repo.find(opts);
  }
}
