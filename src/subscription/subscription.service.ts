import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';

export type Tier = 'free' | 'plus' | 'gold';
export const TIERS: Tier[] = ['free', 'plus', 'gold'];

export interface TierBenefits {
  tier: Tier;
  badge: 'plus' | 'gold' | null;
  adsEnabled: boolean;
  supportPriority: 'normal' | 'high';
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** Single source of truth for what each tier unlocks. */
  tierBenefits(tier: string): TierBenefits {
    const t: Tier = (TIERS as string[]).includes(tier) ? (tier as Tier) : 'free';
    return {
      tier: t,
      badge: t === 'free' ? null : t,
      adsEnabled: t === 'free',
      supportPriority: t === 'gold' ? 'high' : 'normal',
    };
  }

  async getBenefits(userId: number): Promise<TierBenefits> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.tierBenefits((user as any).tier || 'free');
  }

  async setTier(userId: number, tier: string): Promise<TierBenefits> {
    if (!(TIERS as string[]).includes(tier)) {
      throw new NotFoundException(`Unknown tier: ${tier}`);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    (user as any).tier = tier;
    await this.userRepo.save(user);
    return this.tierBenefits(tier);
  }
}
