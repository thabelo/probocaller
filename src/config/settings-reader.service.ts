import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';

/**
 * The single shared reader for every money-affecting admin-configurable rate
 * (RATE_PER_SECOND, PLATFORM_CUT_RATE, SMS_RATE_PER_MESSAGE,
 * PAY_TO_CONTACT_FEE_RATE, …). Every consumer used to keep its OWN
 * `DEFAULT_x` fallback constant — real duplication risk, since a value
 * changed in one place could silently drift from the copies elsewhere.
 *
 * Deliberately has NO fallback default: `AdminService.seedDefaultConfig()`
 * guarantees every one of these rows exists before the app serves a request,
 * so a missing/invalid row here means real misconfiguration, not a normal
 * cold-start case — it must fail loudly rather than silently bill at a stale
 * hardcoded number.
 */
@Injectable()
export class SettingsReaderService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  async getNumber(key: string): Promise<number> {
    const setting = await this.settingRepository.findOne({ where: { key } });
    const value = setting ? parseFloat(setting.value) : NaN;
    if (!Number.isFinite(value)) {
      throw new Error(`Missing or invalid setting: ${key}`);
    }
    return value;
  }
}
