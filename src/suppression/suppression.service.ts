import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SuppressionEntry, SuppressionSource } from './suppression.entity';
import { hashNumber, normalizeNumber } from './number-hash';

export interface UnlistResult {
  suppressed: true;
  alreadyListed: boolean;
}

@Injectable()
export class SuppressionService {
  constructor(
    @InjectRepository(SuppressionEntry)
    private readonly repo: Repository<SuppressionEntry>,
  ) {}

  private assertValid(phoneNumber: string): void {
    const normalized = normalizeNumber(phoneNumber || '');
    if (!/^\+?\d{5,15}$/.test(normalized)) {
      throw new BadRequestException(
        'Invalid phone number. Use digits with an optional leading +.',
      );
    }
  }

  /**
   * Public opt-out: record that this number must not be held or surfaced.
   * Stores only the keyed hash; idempotent (unique index on numberHash).
   */
  async unlist(
    phoneNumber: string,
    reason?: string,
    source: SuppressionSource = 'public',
  ): Promise<UnlistResult> {
    this.assertValid(phoneNumber);
    const numberHash = hashNumber(phoneNumber);

    const existing = await this.repo.findOne({ where: { numberHash } });
    if (existing) return { suppressed: true, alreadyListed: true };

    const entry = this.repo.create({ numberHash, reason: reason ?? null, source });
    await this.repo.save(entry);
    return { suppressed: true, alreadyListed: false };
  }

  async isSuppressed(phoneNumber: string): Promise<boolean> {
    const numberHash = hashNumber(phoneNumber);
    return (await this.repo.count({ where: { numberHash } })) > 0;
  }

  /** Return only the numbers that are NOT suppressed (for upload/report filtering). */
  async filterSuppressed(numbers: string[]): Promise<string[]> {
    if (!numbers?.length) return [];
    const hashes = numbers.map((n) => hashNumber(n));
    const found = await this.repo.find({ where: { numberHash: In(hashes) } });
    const blocked = new Set(found.map((f) => f.numberHash));
    return numbers.filter((n) => !blocked.has(hashNumber(n)));
  }
}
