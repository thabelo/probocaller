import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { BusinessService } from '../business/business.service';

// Threshold of community spam reports at which we consider a number "blocked"
const COMMUNITY_BLOCK_THRESHOLD = 3;

export type LookupStatus =
  | 'not_registered'
  | 'clean'
  | 'flagged'        // community-reported, not yet globally banned
  | 'spam'           // globally marked spam by admin
  | 'verified_business';

export interface LookupResult {
  phoneNumber: string;
  found: boolean;
  status: LookupStatus;
  flags: {
    globalSpam: boolean;
    userReports: number;
    blocked: boolean;
  };
  business: {
    name: string;
    verified: boolean;
    industry: string;
    purposeLabel?: string;
  } | null;
  checkedAt: string;
}

@Injectable()
export class LookupService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly businessService: BusinessService,
  ) {}

  /** Strip whitespace, dashes, parens. Leaves digits and leading +. */
  private normalize(raw: string): string {
    return raw.replace(/[\s().-]/g, '');
  }

  /** Convert ZA local numbers (0XXXXXXXXX) into +27XXXXXXXXX. */
  private toIntlVariant(normalized: string): string | null {
    if (/^0\d{9}$/.test(normalized)) return '+27' + normalized.slice(1);
    return null;
  }

  /**
   * Count how many users have this number in their personal `spamList`.
   *
   * `spamList` is a TypeORM `simple-array` (comma-separated string in DB).
   * We wrap the column with commas at both ends so we can match exact entries
   * (`,+27821234567,`) without false-positive substring hits like
   * `+27821234567` matching `+278212345678`.
   */
  private async countCommunityReports(phoneNumber: string): Promise<number> {
    return this.userRepo
      .createQueryBuilder('u')
      .where(
        `(',' || u."spamList" || ',') LIKE :pattern`,
        { pattern: `%,${phoneNumber},%` },
      )
      .getCount();
  }

  async lookup(rawPhone: string): Promise<LookupResult> {
    const normalized = this.normalize(rawPhone || '');

    // E.164-ish format check: optional leading +, then 5–15 digits.
    if (!/^\+?\d{5,15}$/.test(normalized)) {
      throw new BadRequestException(
        'Invalid phone number format. Use digits with an optional leading +.',
      );
    }

    // Try direct match, then a ZA-local → international variant.
    let user = await this.userRepo.findOne({ where: { phoneNumber: normalized } });
    let canonical = normalized;

    if (!user) {
      const intl = this.toIntlVariant(normalized);
      if (intl) {
        user = await this.userRepo.findOne({ where: { phoneNumber: intl } });
        if (user) canonical = intl;
      }
    }

    const checkedAt = new Date().toISOString();

    if (!user) {
      // Unregistered numbers are the likeliest scam callers — still surface how
      // many users have community-reported them so Scam Shield can score them.
      const userReports = await this.countCommunityReports(canonical);
      return {
        phoneNumber: canonical,
        found: false,
        status: 'not_registered',
        flags: {
          globalSpam: false,
          userReports,
          blocked: userReports >= COMMUNITY_BLOCK_THRESHOLD,
        },
        business: null,
        checkedAt,
      };
    }

    // We never expose user.name / email / id / balance through the public lookup.
    const userReports = await this.countCommunityReports(user.phoneNumber);
    const callerIdentity = await this.businessService.resolveCallerIdentity(user.phoneNumber);

    const business = callerIdentity?.businessProfile
      ? {
          name: callerIdentity.businessProfile.companyName,
          verified: callerIdentity.businessProfile.verified,
          industry: callerIdentity.businessProfile.industry,
          purposeLabel: callerIdentity.numberPurposeLabel,
        }
      : null;

    let status: LookupStatus;
    if (user.isSpam) status = 'spam';
    else if (business?.verified) status = 'verified_business';
    else if (userReports >= COMMUNITY_BLOCK_THRESHOLD) status = 'flagged';
    else status = 'clean';

    return {
      phoneNumber: user.phoneNumber,
      found: true,
      status,
      flags: {
        globalSpam: user.isSpam,
        userReports,
        blocked: user.isSpam || userReports >= COMMUNITY_BLOCK_THRESHOLD,
      },
      business,
      checkedAt,
    };
  }
}
