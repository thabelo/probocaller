import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { ProfileChangeLog } from './profile-change-log.entity';
import { ProfileField } from './profile-field.entity';


const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a report looks. Custom needs both ends. */
export type ReportPeriod = 'day' | 'week' | 'month' | 'custom';

const ROLLING_DAYS: Record<Exclude<ReportPeriod, 'custom'>, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/**
 * Turn "day" / "week" / "month" / a custom pair into a concrete window.
 *
 * Rolling back from now, deliberately. An admin asking who changed something
 * "this week" means the last seven days; anchoring to calendar weeks makes the
 * report collapse to nearly empty every Monday morning, which looks like an
 * outage rather than a boundary.
 *
 * A custom END DATE means the WHOLE of that day. Taken literally it lands on
 * midnight and silently drops everything that happened during the last day the
 * admin actually asked about — the one they are usually most interested in.
 */
export function resolveRange(
  input: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
): { from: Date; to: Date } {
  const period = (input.period ?? 'week') as ReportPeriod;

  if (period !== 'custom') {
    const back = ROLLING_DAYS[period as Exclude<ReportPeriod, 'custom'>];
    if (!back) throw new BadRequestException(`Unknown period "${input.period}".`);
    return { from: new Date(now.getTime() - back * DAY_MS), to: now };
  }

  if (!input.from || !input.to) {
    throw new BadRequestException('A custom range needs both from and to.');
  }

  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('Give the custom range as real dates, e.g. 2026-01-31.');
  }

  // A bare date parses to midnight; push to the end of that day so it is
  // included. A full timestamp is already precise and is left alone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.to);
  return { from, to: dateOnly ? new Date(to.getTime() + DAY_MS) : to };
}

/**
 * Reading a profile's history back.
 *
 * The log stores raw keys and codes, because that is what the profile stores.
 * "income_range: 5k_10k → gt_40k" is not a sentence anybody can read, so the
 * work here is resolving those against the field definitions an admin already
 * maintains — the same labels the person saw when they answered.
 *
 * A field an admin has since retired still appears in histories written while
 * it existed, so every lookup falls back to the raw key rather than throwing.
 * The past does not stop being true because a field was deleted.
 */
export interface ReadableChange {
  id: number;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  changeKind: string;
  actorUserId: number | null;
  /** True when somebody other than the person made the change. */
  byAdmin: boolean;
  changedAt: Date;
}

export interface TopMover {
  userId: number;
  changes: number;
  lastChangedAt: Date;
  phoneNumber: string | null;
  name: string | null;
}

export interface ChangeStats {
  from: Date;
  to: Date;
  totalChanges: number;
  activeUsers: number;
  /** One point per day across the range, quiet days filled with zero. */
  perDay: Array<{ date: string; changes: number }>;
  /** The fields that move most, resolved to labels, most-changed first. */
  byField: Array<{ fieldKey: string; label: string; changes: number }>;
  /** added / updated / cleared. */
  byKind: Array<{ kind: string; changes: number }>;
}

const DAY_MS_STATS = 24 * 60 * 60 * 1000;
/** A daily series longer than this is unreadable and slow — cap it. */
const MAX_DAILY_POINTS = 370;

@Injectable()
export class ProfileHistoryService {
  constructor(
    @InjectRepository(ProfileChangeLog)
    private readonly changeRepo: Repository<ProfileChangeLog>,
    @InjectRepository(ProfileField)
    private readonly fieldRepo: Repository<ProfileField>,
    private readonly dataSource: DataSource,
  ) {}

  /** Everything that ever moved on one person's profile, newest first. */
  async forUser(userId: number, limit = 500): Promise<{ userId: number; changes: ReadableChange[] }> {
    const [rows, fields] = await Promise.all([
      this.changeRepo.find({
        where: { userId },
        // id breaks the tie: several fields saved together share a timestamp,
        // and an unstable order makes two reads of the same history disagree.
        order: { changedAt: 'DESC', id: 'DESC' },
        take: limit,
      }),
      this.fieldRepo.find(),
    ]);

    return { userId, changes: rows.map((row) => this.readable(row, fields)) };
  }

  private readable(row: ProfileChangeLog, fields: ProfileField[]): ReadableChange {
    const field = fields.find((f) => f.key === row.fieldKey);

    // A multi-select is stored comma-joined, so each part is resolved on its
    // own — otherwise a list of two interests resolves to nothing at all.
    const label = (value: string | null): string | null => {
      if (value === null) return null;
      // A yes/no field carries no options, so it would fall through to the
      // stored value and read "Has Medical Aid: true". Nobody writes that.
      if (field?.type === 'boolean') return value === 'true' ? 'Yes' : 'No';
      if (!field?.options?.length) return value;
      return value
        .split(', ')
        .map((part) => field.options.find((o) => o.value === part)?.label ?? part)
        .join(', ');
    };

    return {
      id: row.id,
      fieldKey: row.fieldKey,
      fieldLabel: field?.label ?? row.fieldKey,
      oldValue: row.oldValue,
      newValue: row.newValue,
      oldLabel: label(row.oldValue),
      newLabel: label(row.newValue),
      changeKind: row.changeKind,
      actorUserId: row.actorUserId,
      byAdmin: row.actorUserId != null && row.actorUserId !== row.userId,
      changedAt: row.changedAt,
    };
  }

  /**
   * Who has been keeping their profile up to date, over a window.
   *
   * Grouped in SQL rather than in memory: the whole point of the question is
   * that it spans everybody, and loading every row of a month to count them
   * would get slower exactly as the platform got busier.
   */
  async topMovers({
    from,
    to,
    limit = 20,
  }: { from: Date; to: Date; limit?: number }): Promise<{ from: Date; to: Date; users: TopMover[] }> {
    if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Give a real date range.');
    }
    if (from.getTime() > to.getTime()) {
      // Silently returning nothing would read as "nobody changed anything",
      // which is a different and wrong answer.
      throw new BadRequestException('That date range runs backwards — the start is after the end.');
    }

    const users: TopMover[] = await this.dataSource.query(
      `SELECT c."userId"            AS "userId",
              COUNT(*)::int         AS "changes",
              MAX(c."changedAt")    AS "lastChangedAt",
              u."phoneNumber"       AS "phoneNumber",
              u."name"              AS "name"
         FROM profile_change_logs c
         JOIN users u ON u."id" = c."userId"
        WHERE c."changedAt" >= $1
          AND c."changedAt" < $2
        GROUP BY c."userId", u."phoneNumber", u."name"
        ORDER BY "changes" DESC, "lastChangedAt" DESC
        LIMIT $3`,
      [from, to, limit],
    );

    return { from, to, users: users.map((u) => ({ ...u, changes: Number(u.changes) })) };
  }
  /**
   * Aggregates for the charts on the report page — grouped in SQL so the page
   * plots what it is given and counts nothing itself.
   */
  async changeStats({ from, to }: { from: Date; to: Date }): Promise<ChangeStats> {
    if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Give a real date range.');
    }
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('That date range runs backwards — the start is after the end.');
    }

    const [perDayRows, byFieldRows, byKindRows, totalsRows] = await Promise.all([
      this.dataSource.query(
        `SELECT date_trunc('day', c."changedAt") AS day, COUNT(*)::int AS changes
           FROM profile_change_logs c
          WHERE c."changedAt" >= $1 AND c."changedAt" < $2
          GROUP BY day ORDER BY day ASC`,
        [from, to],
      ),
      this.dataSource.query(
        `SELECT c."fieldKey" AS "fieldKey", COUNT(*)::int AS changes
           FROM profile_change_logs c
          WHERE c."changedAt" >= $1 AND c."changedAt" < $2
          GROUP BY c."fieldKey" ORDER BY changes DESC, c."fieldKey" ASC LIMIT $3`,
        [from, to, 8],
      ),
      this.dataSource.query(
        `SELECT c."changeKind" AS kind, COUNT(*)::int AS changes
           FROM profile_change_logs c
          WHERE c."changedAt" >= $1 AND c."changedAt" < $2
          GROUP BY c."changeKind"`,
        [from, to],
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS "totalChanges", COUNT(DISTINCT c."userId")::int AS "activeUsers"
           FROM profile_change_logs c
          WHERE c."changedAt" >= $1 AND c."changedAt" < $2`,
        [from, to],
      ),
    ]);

    const fields = await this.fieldRepo.find();
    const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

    return {
      from,
      to,
      totalChanges: Number(totalsRows?.[0]?.totalChanges ?? 0),
      activeUsers: Number(totalsRows?.[0]?.activeUsers ?? 0),
      perDay: this.fillDays(from, to, perDayRows),
      byField: (byFieldRows ?? []).map((r: any) => ({
        fieldKey: r.fieldKey,
        label: labelOf(r.fieldKey),
        changes: Number(r.changes),
      })),
      byKind: (byKindRows ?? []).map((r: any) => ({ kind: r.kind, changes: Number(r.changes) })),
    };
  }

  /**
   * One point per day from `from` up to (not including) `to`, quiet days at
   * zero — a time series with gaps reads as missing data, not as calm. Capped,
   * so an absurd custom range cannot emit thousands of points.
   */
  private fillDays(
    from: Date,
    to: Date,
    rows: Array<{ day: Date | string; changes: number }>,
  ): Array<{ date: string; changes: number }> {
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(new Date(row.day)), Number(row.changes));

    const out: Array<{ date: string; changes: number }> = [];
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    for (let t = start.getTime(); t < to.getTime() && out.length < MAX_DAILY_POINTS; t += DAY_MS_STATS) {
      const date = key(new Date(t));
      out.push({ date, changes: counts.get(date) ?? 0 });
    }
    return out;
  }

}
