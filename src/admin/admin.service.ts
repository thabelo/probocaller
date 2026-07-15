import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { CallLog } from '../call/call.entity';
import { Setting } from '../config/setting.entity';
import { Business } from '../business/business.entity';
import { TransactionService } from '../transaction/transaction.service';
import { AuditService } from '../audit/audit.service';

/**
 * Escape one CSV cell: guard against spreadsheet formula injection by prefixing
 * a quote when a value starts with = + - or @, then RFC-4180 quote/escape.
 */
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CallLog)
    private callRepository: Repository<CallLog>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
    private readonly transactionService: TransactionService,
    private readonly auditService: AuditService,
  ) {}

  async getStats() {
    const totalUsers = await this.userRepository.count();
    const businessUsers = await this.userRepository.count({ where: { isBusiness: true } });
    const totalCalls = await this.callRepository.count();

    const calls = await this.callRepository.find();
    const platformRevenue = calls.reduce((sum, c) => sum + Number(c.platformCut || 0), 0);
    const totalPaidToUsers = calls.reduce((sum, c) => sum + Number(c.userEarnings || 0), 0);
    const totalBusinessSpend = calls.reduce((sum, c) => sum + Number(c.cost || 0), 0);
    const completedCalls = calls.filter((c) => c.status === 'completed').length;

    // Earnings users made *from people they invited* — the platform-funded 3%
    // referral commissions, separate from the direct call earnings above.
    const referralEarnings = await this.transactionService.sumByType('REFERRAL_COMMISSION');

    return {
      totalUsers,
      businessUsers,
      totalCalls,
      completedCalls,
      platformRevenue: parseFloat(platformRevenue.toFixed(6)),
      totalPaidToUsers: parseFloat(totalPaidToUsers.toFixed(6)),
      referralEarnings,
      totalBusinessSpend: parseFloat(totalBusinessSpend.toFixed(6)),
    };
  }

  async getRevenueTrend(): Promise<{ date: string; revenue: number; callCount: number }[]> {
    const calls = await this.callRepository.find({ order: { startedAt: 'ASC' } });
    const days: Record<string, { revenue: number; callCount: number }> = {};

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { revenue: 0, callCount: 0 };
    }

    for (const call of calls) {
      const key = new Date(call.startedAt).toISOString().slice(0, 10);
      if (days[key]) {
        days[key].revenue += Number(call.platformCut || 0);
        days[key].callCount++;
      }
    }

    return Object.entries(days).map(([date, data]) => ({
      date,
      revenue: parseFloat(data.revenue.toFixed(4)),
      callCount: data.callCount,
    }));
  }

  async getTopBusinesses(limit = 5): Promise<any[]> {
    const calls = await this.callRepository.find({ where: { status: 'completed' } });
    const spendMap: Record<number, number> = {};
    for (const call of calls) {
      spendMap[call.toUserId] = (spendMap[call.toUserId] || 0) + Number(call.cost || 0);
    }

    const topEntries = Object.entries(spendMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit);

    const result = [];
    for (const [userId, totalSpend] of topEntries) {
      const user = await this.userRepository.findOne({ where: { id: parseInt(userId) } });
      if (user) {
        result.push({
          id: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          totalSpend: parseFloat(totalSpend.toFixed(4)),
          walletBalance: Number(user.walletBalance),
        });
      }
    }
    return result;
  }

  async getAllUsers() {
    const users = await this.userRepository.find({ order: { createdAt: 'DESC' } });
    return users.map((u) => this.serializeUser(u));
  }

  private serializeUser(u: any) {
    return {
      id: u.id,
      name: u.name,
      phoneNumber: u.phoneNumber,
      email: u.email,
      role: u.role,
      isBusiness: u.isBusiness,
      walletBalance: Number(u.walletBalance),
      isSpam: u.isSpam,
      createdAt: u.createdAt,
      callPermissionMode: u.callPermissionMode ?? 'all',
      allowedCallWindows: u.allowedCallWindows ?? [],
      dataShareEnabled: u.dataShareEnabled ?? false,
      dataCategories: u.dataCategories ?? [],
    };
  }

  async adminGetUserPrivacy(userId: number) {
    const u = await this.userRepository.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return {
      callPermissionMode: u.callPermissionMode ?? 'all',
      allowedCallWindows: u.allowedCallWindows ?? [],
      dataShareEnabled: u.dataShareEnabled ?? false,
      dataCategories: u.dataCategories ?? [],
    };
  }

  async adminUpdateUserPrivacy(userId: number, data: {
    callPermissionMode?: string;
    allowedCallWindows?: { dayOfWeek: number; startTime: string; endTime: string }[];
    dataShareEnabled?: boolean;
    dataCategories?: string[];
  }) {
    const u = await this.userRepository.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    if (data.callPermissionMode !== undefined) u.callPermissionMode = data.callPermissionMode;
    if (data.allowedCallWindows !== undefined) u.allowedCallWindows = data.allowedCallWindows;
    if (data.dataShareEnabled !== undefined) u.dataShareEnabled = data.dataShareEnabled;
    if (data.dataCategories !== undefined) u.dataCategories = data.dataCategories;
    await this.userRepository.save(u);
    return this.adminGetUserPrivacy(userId);
  }

  async updateUser(id: number, data: { isBusiness?: boolean; walletBalance?: number; role?: string; isSpam?: boolean }) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (data.isBusiness !== undefined) user.isBusiness = data.isBusiness;
    if (data.walletBalance !== undefined) user.walletBalance = data.walletBalance;
    if (data.role !== undefined) user.role = data.role;
    if (data.isSpam !== undefined) user.isSpam = data.isSpam;

    await this.userRepository.save(user);
    return this.serializeUser(user);
  }

  /**
   * Apply one bounded change to many users at once. Only safe, non-monetary
   * fields are whitelisted — wallet balances must go through addCredit so they
   * land in the ledger. Throws if no ids or no allowed fields are given.
   */
  async bulkUpdateUsers(
    ids: number[],
    patch: { isSpam?: boolean; role?: string; isBusiness?: boolean },
    actorUserId?: number,
  ): Promise<{ updated: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('At least one user id is required');
    }
    const allowed: Record<string, unknown> = {};
    if (patch?.isSpam !== undefined) allowed.isSpam = patch.isSpam;
    if (patch?.role !== undefined) allowed.role = patch.role;
    if (patch?.isBusiness !== undefined) allowed.isBusiness = patch.isBusiness;
    if (Object.keys(allowed).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }
    const res = await this.userRepository.update({ id: In(ids) }, allowed);
    await this.auditService.record({
      actorUserId: actorUserId ?? null,
      action: 'admin.users.bulk_update',
      targetType: 'user',
      targetId: ids.join(','),
      metadata: { patch: allowed, count: res.affected ?? 0 },
    });
    return { updated: res.affected ?? 0 };
  }

  /**
   * Server-side CSV export of all users. Every user-controlled cell is escaped
   * (formula-injection guard + RFC-4180 quoting) so opening the file in a
   * spreadsheet can't execute a payload.
   */
  async exportUsersCsv(): Promise<string> {
    const users = await this.userRepository.find({ order: { createdAt: 'DESC' } });
    const header = ['id', 'name', 'phoneNumber', 'email', 'role', 'isBusiness', 'walletBalance', 'isSpam', 'createdAt'];
    const rows = users.map((u) => [
      u.id,
      u.name,
      u.phoneNumber,
      u.email,
      u.role,
      u.isBusiness ? 'business' : 'user',
      Number(u.walletBalance).toFixed(4),
      u.isSpam ? 'yes' : 'no',
      u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
    ]);
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  }

  async addCredit(id: number, amount: number) {
    // A zero or non-finite adjustment is never a real credit/debit; rejecting it
    // avoids writing a misleading ADMIN_DEBIT of $0.00 to the ledger.
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Adjustment amount must be a non-zero number');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    user.walletBalance = parseFloat((Number(user.walletBalance) + amount).toFixed(6));
    await this.userRepository.save(user);
    await this.transactionService.log(
      user.id,
      amount > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
      amount,
      `Admin ${amount > 0 ? 'credit' : 'debit'} of $${Math.abs(amount).toFixed(2)}`,
    );
    return { id: user.id, name: user.name, walletBalance: Number(user.walletBalance) };
  }

  private mapCallRow(log: CallLog) {
    return {
      id: log.id,
      fromUserId: log.fromUserId,
      toUserId: log.toUserId,
      duration: log.duration,
      cost: log.cost,
      platformCut: log.platformCut,
      userEarnings: log.userEarnings,
      ratePerSecond: log.ratePerSecond,
      status: log.status,
      blockedReason: log.blockedReason,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      fromUser: log.fromUser
        ? { id: log.fromUser.id, name: log.fromUser.name, phoneNumber: log.fromUser.phoneNumber, isBusiness: log.fromUser.isBusiness }
        : null,
      toUser: log.toUser
        ? { id: log.toUser.id, name: log.toUser.name, phoneNumber: log.toUser.phoneNumber, isBusiness: log.toUser.isBusiness }
        : null,
    };
  }

  private async enrichWithBusinessNames(calls: any[]): Promise<any[]> {
    const businessUserIds = new Set<number>();
    for (const c of calls) {
      if (c.toUser?.isBusiness) businessUserIds.add(c.toUserId);
      if (c.fromUser?.isBusiness) businessUserIds.add(c.fromUserId);
    }
    if (businessUserIds.size === 0) return calls;

    const profiles = await this.businessRepository.find({
      where: [...businessUserIds].map(id => ({ userId: id })),
      select: ['userId', 'companyName'],
    });
    const companyMap: Record<number, string> = {};
    for (const p of profiles) companyMap[p.userId] = p.companyName;

    return calls.map(c => ({
      ...c,
      toUser: c.toUser ? { ...c.toUser, companyName: c.toUser.isBusiness ? (companyMap[c.toUserId] ?? null) : null } : null,
      fromUser: c.fromUser ? { ...c.fromUser, companyName: c.fromUser.isBusiness ? (companyMap[c.fromUserId] ?? null) : null } : null,
    }));
  }

  // Live-call window: only show calls that started within the last 5 minutes.
  // Any call still `status:'initiated'` past this point is a stuck row from a
  // client crash, lost network, or short-lived call that bypassed completeCall.
  // Showing them as "Live Now" misleads operators — hide them and auto-sweep.
  private static readonly LIVE_CALL_WINDOW_MS = 5 * 60 * 1000;

  async getLiveCalls() {
    const now = Date.now();
    const cutoff = new Date(now - AdminService.LIVE_CALL_WINDOW_MS);

    // Auto-sweep: mark any "initiated" call older than the window as completed
    // with duration=0 so it stops appearing live and counts as a missed/zero-cost
    // entry in the historical log. Best-effort — failures don't block the read.
    try {
      await this.callRepository
        .createQueryBuilder()
        .update()
        .set({ status: 'completed', duration: 0, completedAt: () => 'NOW()' })
        .where('status = :status', { status: 'initiated' })
        .andWhere('startedAt < :cutoff', { cutoff })
        .execute();
    } catch (e) {
      // Don't fail the live-calls request if sweep fails
      console.warn('[admin] live-call sweep failed', e);
    }

    const rows = await this.callRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.fromUser', 'fromUser')
      .leftJoinAndSelect('log.toUser', 'toUser')
      .where('log.status = :status', { status: 'initiated' })
      .andWhere('log.startedAt >= :cutoff', { cutoff })
      .orderBy('log.startedAt', 'ASC')
      .getMany();
    return this.enrichWithBusinessNames(rows.map((r) => this.mapCallRow(r)));
  }

  async getAllCalls(filters?: { search?: string; from?: string; to?: string }) {
    const qb = this.callRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.fromUser', 'fromUser')
      .leftJoinAndSelect('log.toUser', 'toUser')
      .orderBy('log.startedAt', 'DESC');

    if (filters?.from) qb.andWhere('log.startedAt >= :from', { from: new Date(filters.from) });
    if (filters?.to) {
      const to = new Date(filters.to);
      to.setHours(23, 59, 59, 999);
      qb.andWhere('log.startedAt <= :to', { to });
    }
    if (filters?.search) {
      const s = `%${filters.search}%`;
      qb.andWhere(
        '(fromUser.phoneNumber LIKE :s OR toUser.phoneNumber LIKE :s OR fromUser.name LIKE :s OR toUser.name LIKE :s)',
        { s },
      );
    }

    const rows = await qb.getMany();
    return this.enrichWithBusinessNames(rows.map((r) => this.mapCallRow(r)));
  }

  async getBusinessStats(businessId: number): Promise<{
    totalSpend: number;
    thisMonthSpend: number;
    last7dSpend: number;
    avgDailySpend: number;
    estimatedDaysRemaining: number | null;
    totalCalls: number;
    trend: { date: string; spend: number; calls: number }[];
  }> {
    const profile = await this.businessRepository.findOne({ where: { id: businessId } });
    if (!profile) throw new Error('Business not found');

    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const calls = await this.callRepository.find({
      where: { toUserId: profile.userId, status: 'completed' },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const totalSpend = calls.reduce((s, c) => s + Number(c.cost || 0), 0);
    const thisMonthSpend = calls.filter(c => new Date(c.startedAt) >= monthStart)
      .reduce((s, c) => s + Number(c.cost || 0), 0);
    const last7dSpend = calls.filter(c => new Date(c.startedAt) >= weekAgo)
      .reduce((s, c) => s + Number(c.cost || 0), 0);
    const avgDailySpend = last7dSpend / 7;

    const user = await this.userRepository.findOne({ where: { id: profile.userId } });
    const balance = Number(user?.walletBalance ?? 0);
    const estimatedDaysRemaining = avgDailySpend > 0 ? Math.floor(balance / avgDailySpend) : null;

    const days: Record<string, { spend: number; calls: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { spend: 0, calls: 0 };
    }
    for (const call of calls) {
      const key = new Date(call.startedAt).toISOString().slice(0, 10);
      if (days[key]) {
        days[key].spend += Number(call.cost || 0);
        days[key].calls++;
      }
    }

    return {
      totalSpend: parseFloat(totalSpend.toFixed(4)),
      thisMonthSpend: parseFloat(thisMonthSpend.toFixed(4)),
      last7dSpend: parseFloat(last7dSpend.toFixed(4)),
      avgDailySpend: parseFloat(avgDailySpend.toFixed(6)),
      estimatedDaysRemaining,
      totalCalls: calls.length,
      trend: Object.entries(days).map(([date, d]) => ({
        date,
        spend: parseFloat(d.spend.toFixed(4)),
        calls: d.calls,
      })),
    };
  }

  async getConfig(): Promise<Record<string, string>> {
    const settings = await this.settingRepository.find();
    const result: Record<string, string> = {};
    for (const s of settings) result[s.key] = s.value;
    return result;
  }

  async updateConfig(key: string, value: string): Promise<Setting> {
    let setting = await this.settingRepository.findOne({ where: { key } });
    if (!setting) setting = this.settingRepository.create({ key, value });
    else setting.value = value;
    return this.settingRepository.save(setting);
  }

  async seedDefaultConfig(): Promise<void> {
    const defaults = [
      { key: 'RATE_PER_SECOND', value: '0.002', description: 'Charge per second for business calls (USD)' },
      { key: 'PLATFORM_CUT_RATE', value: '0.24', description: 'Platform revenue share (0.24 = 24%)' },
      { key: 'LEADS_BASE_FEE', value: '250', description: 'Data-certificate base fee (ZAR), covers the baseline authorisation window' },
      { key: 'LEADS_BASELINE_DAYS', value: '30', description: 'Baseline authorisation window (days) the base fee covers; pro-rata divisor for leads cost' },
    ];
    for (const def of defaults) {
      const existing = await this.settingRepository.findOne({ where: { key: def.key } });
      if (!existing) await this.settingRepository.save(this.settingRepository.create(def));
    }
  }

}
