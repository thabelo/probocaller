import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReverseLookupEvent } from './reverse-lookup-event.entity';
import { NumberIntelligence } from './google-places-lookup.service';
import { SettingsReaderService } from '../config/settings-reader.service';

const round4 = (n: number) => parseFloat(n.toFixed(4));
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface ReverseLookupStats {
  totalLookups: number;
  billedLookups: number;
  cachedLookups: number;
  cacheHitRate: number;
  totalCostUsd: number;
  costThisMonthUsd: number;
  avgCostPerBilledUsd: number;
  byResolution: { label: string; count: number }[];
  dailyTrend: { date: string; count: number; costUsd: number }[];
}

/**
 * Records and aggregates reverse-lookup (Google Places) usage for the admin
 * billing dashboard. Google bills a flat rate per Find Place request whether or
 * not a match comes back, so every uncached call costs the admin-configured
 * GOOGLE_PLACES_COST_USD rate; a cached hit served from our own data is free.
 */
@Injectable()
export class ReverseLookupService {
  constructor(
    @InjectRepository(ReverseLookupEvent)
    private readonly repo: Repository<ReverseLookupEvent>,
    private readonly settingsReader: SettingsReaderService,
  ) {}

  /** Log one reverse-lookup, computing its estimated cost from the fields returned. */
  async record(input: {
    phoneNumber: string;
    result: NumberIntelligence | null;
    cached?: boolean;
  }): Promise<ReverseLookupEvent> {
    const cached = !!input.cached;
    const lineType = input.result?.lineType ?? null;
    const hasName = !!input.result?.callerName;
    const success = !!input.result;
    // Google bills per request regardless of whether a match came back; a cached
    // hit (served from our own data) is free. We store hasName as a boolean only —
    // the returned name itself is never persisted (provider ToS). The rate is
    // read live from the admin-configurable GOOGLE_PLACES_COST_USD setting —
    // no hardcoded fallback, AdminService.seedDefaultConfig guarantees the
    // row exists.
    const cost = cached ? 0 : await this.settingsReader.getNumber('GOOGLE_PLACES_COST_USD');

    const ev = this.repo.create({
      phoneNumber: input.phoneNumber,
      provider: 'google',
      cached,
      lineType,
      hasName,
      success,
      costUsd: cost.toFixed(4),
    });
    return this.repo.save(ev);
  }

  async getStats(): Promise<ReverseLookupStats> {
    const events = await this.repo.find();
    const total = events.length;
    const cached = events.filter((e) => e.cached).length;
    const billed = total - cached;
    const totalCost = events.reduce((s, e) => s + Number(e.costUsd || 0), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const costThisMonth = events
      .filter((e) => new Date(e.createdAt) >= monthStart)
      .reduce((s, e) => s + Number(e.costUsd || 0), 0);

    // Google resolves a *business name* or nothing (no carrier/line-type), so the
    // meaningful breakdown is how often a lookup actually matched a listing.
    const named = events.filter((e) => e.hasName).length;
    const byResolution = [
      { label: 'Name found', count: named },
      { label: 'No match', count: total - named },
    ];

    // Last 7 days (oldest → newest), each with count + cost.
    const dailyTrend: { date: string; count: number; costUsd: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = dayKey(d);
      const dayEvents = events.filter((e) => dayKey(new Date(e.createdAt)) === key);
      dailyTrend.push({
        date: key,
        count: dayEvents.length,
        costUsd: round4(dayEvents.reduce((s, e) => s + Number(e.costUsd || 0), 0)),
      });
    }

    return {
      totalLookups: total,
      billedLookups: billed,
      cachedLookups: cached,
      cacheHitRate: total ? cached / total : 0,
      totalCostUsd: round4(totalCost),
      costThisMonthUsd: round4(costThisMonth),
      avgCostPerBilledUsd: billed ? round4(totalCost / billed) : 0,
      byResolution,
      dailyTrend,
    };
  }

  async getHistory(limit = 50, offset = 0): Promise<ReverseLookupEvent[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit, skip: offset });
  }
}
