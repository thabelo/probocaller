import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../config/setting.entity';

// Live FX feed, base = ZAR (free, no key, 160+ currencies incl. African ones).
const FX_URL = 'https://open.er-api.com/v6/latest/ZAR';
const LIVE_TTL_MS = 60 * 60 * 1000;        // cache live rates for 1 hour
const FALLBACK_TTL_MS = 5 * 60 * 1000;     // retry the live feed sooner after a failure
const CACHE_KEY = 'FX_RATES_CACHE';        // last-good live rates, persisted for cold starts

// Static ZAR-based fallback (illustrative), used only when the live feed is
// unavailable so real-money display never breaks. Derived from a USD table at
// ~R18.5/$; NAD is pegged to ZAR (1:1).
const FALLBACK_RATES: Record<string, number> = {
  ZAR: 1,
  USD: 1 / 18.5,
  GBP: 0.79 / 18.5,
  EUR: 0.92 / 18.5,
  NGN: 1550 / 18.5,
  KES: 129 / 18.5,
  GHS: 15.3 / 18.5,
  TZS: 2550 / 18.5,
  UGX: 3750 / 18.5,
  ZMW: 27 / 18.5,
  BWP: 13.6 / 18.5,
  NAD: 1,
  RWF: 1300 / 18.5,
  MUR: 46 / 18.5,
  EGP: 48 / 18.5,
};

export interface FxRates {
  base: 'ZAR';
  rates: Record<string, number>;
  updatedAt: string;
  source: 'live' | 'cached' | 'fallback';
}

/**
 * Serves ZAR-based FX rates for real-money display conversion. Fetches a live
 * feed, caches it, and falls back to a static table when the feed is down.
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private cache: (FxRates & { expiresAt: number }) | null = null;

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
  ) {}

  async getRates(): Promise<FxRates> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      const { expiresAt, ...rest } = this.cache;
      return rest;
    }

    try {
      const res = await fetch(FX_URL);
      if (!res.ok) throw new Error(`FX feed HTTP ${res.status}`);
      const data: any = await res.json();
      if (data?.result !== 'success' || !data?.rates || typeof data.rates !== 'object') {
        throw new Error('FX feed returned an unexpected payload');
      }
      const updatedAt = new Date().toISOString();
      this.cache = { base: 'ZAR', rates: data.rates, updatedAt, source: 'live', expiresAt: now + LIVE_TTL_MS };
      await this.persist(data.rates, updatedAt);
    } catch (e) {
      this.logger.warn(`Live FX unavailable: ${String(e)}`);
      const persisted = await this.loadPersisted();
      if (persisted) {
        // A recent live snapshot beats the stale static table.
        this.cache = { base: 'ZAR', rates: persisted.rates, updatedAt: persisted.updatedAt, source: 'cached', expiresAt: now + FALLBACK_TTL_MS };
      } else {
        this.cache = { base: 'ZAR', rates: FALLBACK_RATES, updatedAt: new Date().toISOString(), source: 'fallback', expiresAt: now + FALLBACK_TTL_MS };
      }
    }

    const { expiresAt, ...rest } = this.cache;
    return rest;
  }

  private async persist(rates: Record<string, number>, updatedAt: string): Promise<void> {
    try {
      const value = JSON.stringify({ rates, updatedAt });
      let row = await this.settingRepo.findOne({ where: { key: CACHE_KEY } });
      if (!row) row = this.settingRepo.create({ key: CACHE_KEY, value, description: 'Last-good live FX rates (base ZAR)' });
      else row.value = value;
      await this.settingRepo.save(row);
    } catch (e) {
      this.logger.warn(`Could not persist FX rates: ${String(e)}`);
    }
  }

  private async loadPersisted(): Promise<{ rates: Record<string, number>; updatedAt: string } | null> {
    try {
      const row = await this.settingRepo.findOne({ where: { key: CACHE_KEY } });
      if (!row) return null;
      const parsed = JSON.parse(row.value);
      return parsed?.rates && typeof parsed.rates === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}
