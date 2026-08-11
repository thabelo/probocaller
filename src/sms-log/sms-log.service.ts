import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { SmsLog } from './sms-log.entity';
import { CreateSmsLogDto } from './dto/create-sms-log.dto';
import { QuerySmsLogsDto } from './dto/query-sms-logs.dto';
import { normalizeNumber } from '../suppression/number-hash';
import { Business } from '../business/business.entity';
import { User } from '../user/user.entity';
import { BusinessService } from '../business/business.service';
import { ReferralService } from '../referral/referral.service';
import { TransactionService } from '../transaction/transaction.service';
import { SettingsReaderService } from '../config/settings-reader.service';

@Injectable()
export class SmsLogService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly repo: Repository<SmsLog>,
    private readonly businessService: BusinessService,
    private readonly referralService: ReferralService,
    private readonly transactionService: TransactionService,
    private readonly settingsReader: SettingsReaderService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Persist the log row, unconditionally — inside the billing transaction's
   * manager when one is given (so it commits atomically with the money move),
   * or via the plain repository otherwise.
   */
  private saveLog(userId: number, dto: CreateSmsLogDto, manager?: EntityManager): Promise<SmsLog> {
    const data = {
      userId,
      address: normalizeNumber(dto.address),
      bodyHash: dto.bodyHash,
      category: dto.category,
      decision: dto.decision,
      matchedKeyword: dto.matchedKeyword ?? null,
    };
    if (manager) {
      return manager.save(SmsLog, manager.create(SmsLog, data));
    }
    return this.repo.save(this.repo.create(data));
  }

  /**
   * Log every SMS the device evaluates. Billing ONLY applies to a business
   * SMS the client's policy decided to charge for (category:'business' +
   * decision:'paid') — mirrors CallService.completeCall's business-call money
   * move: the business (sender) pays, the receiving user earns, the platform
   * takes its cut, and the receiver's referrer (if any) is paid a lifetime
   * commission carved out of the platform's own cut. Every other
   * category/decision combination just logs the row — no money moves.
   */
  async create(userId: number, dto: CreateSmsLogDto): Promise<SmsLog> {
    if (dto.category !== 'business' || dto.decision !== 'paid') {
      return this.saveLog(userId, dto);
    }

    // Should normally always resolve — the client only sets category:'business'
    // for numbers it already recognises as business via the synced
    // /business-numbers/sync list — but never block the log write if it doesn't.
    const identity = await this.businessService.resolveCallerIdentity(dto.address);
    if (!identity) {
      return this.saveLog(userId, dto);
    }

    return this.dataSource.transaction(async (manager) => {
      const business = await manager.findOne(Business, { where: { id: identity.businessId } });
      if (!business) {
        return this.saveLog(userId, dto, manager);
      }

      const owner = await manager.findOne(User, {
        where: { id: business.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!owner) {
        return this.saveLog(userId, dto, manager);
      }

      const smsRatePerMessage = await this.settingsReader.getNumber('SMS_RATE_PER_MESSAGE');
      const platformCutRate = await this.settingsReader.getNumber('PLATFORM_CUT_RATE');

      // Cap the charge at the funds the business actually holds — the message
      // was already delivered, so it can never be blocked after the fact; a
      // business with 0 balance just gets a 0-cost message. Mirrors
      // CallService.completeCall's floor.
      const available = Math.max(0, Number(owner.walletBalance));
      const businessCost = Math.min(smsRatePerMessage, available);
      const platformCut = parseFloat((businessCost * platformCutRate).toFixed(6));
      const userEarnings = parseFloat((businessCost - platformCut).toFixed(6));

      owner.walletBalance = parseFloat((available - businessCost).toFixed(6));
      await manager.save(User, owner);
      await this.transactionService.log(
        owner.id,
        'SMS_CHARGE',
        -businessCost,
        `Business SMS to a user — rate R${smsRatePerMessage}/msg`,
        undefined,
        manager,
        business.id,
      );

      const receiver = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (receiver) {
        receiver.walletBalance = parseFloat((Number(receiver.walletBalance) + userEarnings).toFixed(6));
        await manager.save(User, receiver);
        await this.transactionService.log(
          receiver.id,
          'SMS_EARN',
          userEarnings,
          `Earned from a business SMS from ${business.companyName || 'business'}`,
          undefined,
          manager,
          business.id,
        );

        // Lifetime referral commission: if the receiver was referred, pay their
        // referrer an EXTRA admin-configured % of the PLATFORM's OWN cut (not
        // the receiver's earnings) inside the SAME tx. Platform-funded: the
        // receiver's credited amount above is unaffected.
        await this.referralService.payCommission(receiver.id, platformCut, manager);
      }

      return this.saveLog(userId, dto, manager);
    });
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
    byKeyword: Array<{ keyword: string; count: number }>;
  }> {
    const rows = await this.applyFilters(this.repo.createQueryBuilder('s'), q)
      .orderBy('s.createdAt', 'ASC')
      .getMany();

    const byDecision: Record<string, number> = { free: 0, paid: 0, blocked: 0 };
    const byCategory: Record<string, number> = { contacts: 0, business: 0, newSender: 0, unknown: 0 };
    const days = new Map<string, { date: string; blocked: number; paid: number; free: number }>();
    const senders = new Map<string, { address: string; count: number; blocked: number }>();
    const keywords = new Map<string, number>();

    for (const r of rows) {
      if (r.decision in byDecision) byDecision[r.decision] += 1;
      if (r.category in byCategory) byCategory[r.category] += 1;

      if (r.matchedKeyword) keywords.set(r.matchedKeyword, (keywords.get(r.matchedKeyword) ?? 0) + 1);

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
    const byKeyword = [...keywords.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return { byDecision, byCategory, overTime, topSenders, byKeyword };
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
