import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { SmsLog } from './sms-log.entity';
import { CreateSmsLogDto } from './dto/create-sms-log.dto';
import { QuerySmsLogsDto } from './dto/query-sms-logs.dto';
import { normalizeNumber } from '../suppression/number-hash';

@Injectable()
export class SmsLogService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly repo: Repository<SmsLog>,
  ) {}

  async create(userId: number, dto: CreateSmsLogDto): Promise<SmsLog> {
    const log = this.repo.create({
      userId,
      address: normalizeNumber(dto.address),
      bodyHash: dto.bodyHash,
      category: dto.category,
      decision: dto.decision,
      matchedKeyword: dto.matchedKeyword ?? null,
    });
    return this.repo.save(log);
  }

  findAllForUser(userId: number): Promise<SmsLog[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Cross-user admin listing with filtering + pagination. The where clauses are
   * shared with statsFor via applyFilters so the numbers a page shows always
   * match the aggregate stats sitting above the table.
   */
  async findFiltered(q: QuerySmsLogsDto): Promise<{ data: SmsLog[]; total: number }> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const [data, total] = await this.applyFilters(this.repo.createQueryBuilder('s'), q)
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, total };
  }

  /**
   * Aggregate stats over the FILTERED set, ignoring page/limit — the figures
   * describe every matching row, not just the current page. Computed with a
   * single filtered fetch reduced in TypeScript so there are no DB-specific
   * date functions (portable across Postgres in dev and sqlite in tests).
   */
  async statsFor(q: QuerySmsLogsDto): Promise<{
    byDecision: Record<string, number>;
    byCategory: Record<string, number>;
    overTime: Array<{ date: string; blocked: number; paid: number; free: number }>;
    topSenders: Array<{ address: string; count: number; blocked: number }>;
  }> {
    const rows = await this.applyFilters(this.repo.createQueryBuilder('s'), q)
      .orderBy('s.createdAt', 'ASC')
      .getMany();

    const byDecision: Record<string, number> = { free: 0, paid: 0, blocked: 0 };
    const byCategory: Record<string, number> = { contacts: 0, business: 0, newSender: 0, unknown: 0 };
    const days = new Map<string, { date: string; blocked: number; paid: number; free: number }>();
    const senders = new Map<string, { address: string; count: number; blocked: number }>();

    for (const r of rows) {
      if (r.decision in byDecision) byDecision[r.decision] += 1;
      if (r.category in byCategory) byCategory[r.category] += 1;

      const date = new Date(r.createdAt).toISOString().slice(0, 10);
      const bucket = days.get(date) ?? { date, blocked: 0, paid: 0, free: 0 };
      if (r.decision === 'blocked') bucket.blocked += 1;
      else if (r.decision === 'paid') bucket.paid += 1;
      else if (r.decision === 'free') bucket.free += 1;
      days.set(date, bucket);

      const s = senders.get(r.address) ?? { address: r.address, count: 0, blocked: 0 };
      s.count += 1;
      if (r.decision === 'blocked') s.blocked += 1;
      senders.set(r.address, s);
    }

    const overTime = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const topSenders = [...senders.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    return { byDecision, byCategory, overTime, topSenders };
  }

  /** Shared where clauses for findFiltered + statsFor. */
  private applyFilters(
    qb: SelectQueryBuilder<SmsLog>,
    q: QuerySmsLogsDto,
  ): SelectQueryBuilder<SmsLog> {
    if (q.userId != null) qb.andWhere('s.userId = :userId', { userId: q.userId });
    if (q.decision) qb.andWhere('s.decision = :decision', { decision: q.decision });
    if (q.category) qb.andWhere('s.category = :category', { category: q.category });
    if (q.address) {
      qb.andWhere('LOWER(s.address) LIKE LOWER(:address)', { address: `%${q.address}%` });
    }
    if (q.keyword) qb.andWhere('s.matchedKeyword = :keyword', { keyword: q.keyword });
    if (q.from) qb.andWhere('s.createdAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('s.createdAt <= :to', { to: endOfRange(q.to) });
    return qb;
  }
}

/**
 * A date-only upper bound (YYYY-MM-DD) is inclusive to the end of that UTC day;
 * a full timestamp is used verbatim.
 */
function endOfRange(to: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Date(`${to}T23:59:59.999Z`);
  return new Date(to);
}
