import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserConsent, ConsentType } from './user-consent.entity';

/**
 * Records explicit, versioned, timestamped user opt-ins (data sharing, terms,
 * privacy) so consent is auditable and we can re-prompt when a policy version
 * changes. Granting a consent supersedes (revokes) any prior active one of the
 * same type, leaving a full history.
 */
@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(UserConsent)
    private readonly repo: Repository<UserConsent>,
  ) {}

  async grant(userId: number, type: ConsentType, version: string, now: Date = new Date()): Promise<UserConsent> {
    await this.repo.update(
      { userId, consentType: type, revokedAt: IsNull() },
      { revokedAt: now },
    );
    const row = this.repo.create({
      userId,
      consentType: type,
      version,
      grantedAt: now,
      revokedAt: null,
    });
    return this.repo.save(row);
  }

  async revoke(userId: number, type: ConsentType, now: Date = new Date()): Promise<{ revoked: number }> {
    const res = await this.repo.update(
      { userId, consentType: type, revokedAt: IsNull() },
      { revokedAt: now },
    );
    return { revoked: res.affected ?? 0 };
  }

  async hasActiveConsent(userId: number, type: ConsentType): Promise<boolean> {
    const count = await this.repo.count({
      where: { userId, consentType: type, revokedAt: IsNull() },
    });
    return count > 0;
  }

  getActive(userId: number): Promise<UserConsent[]> {
    return this.repo.find({ where: { userId, revokedAt: IsNull() } });
  }
}
