import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import type { UserAccessContext } from './marketplace.service';

@Injectable()
export class UserAccessContextService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  async forUser(userId: number): Promise<UserAccessContext> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return { hasBusinessAccess: false, kybVerified: false };

    const business = await this.businessRepo.findOne({ where: { userId } });

    return {
      hasBusinessAccess: this.resolveBusinessAccess(user),
      kybVerified: !!business?.verified,
    };
  }

  /**
   * Mirrors the client's tri-state rule: an explicit opt-out wins over being a
   * registered company, and only an unanswered flag falls back to `isBusiness`.
   */
  private resolveBusinessAccess(user: Partial<User>): boolean {
    const optIn = (user as any).businessOptIn;
    if (optIn === true || optIn === false) return optIn;
    return !!user.isBusiness;
  }
}
