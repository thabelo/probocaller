import { Injectable, BadRequestException, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { BusinessService } from '../business/business.service';
import { SuppressionService } from '../suppression/suppression.service';
import {
  NUMBER_INTELLIGENCE,
  NumberIntelligence,
  NumberIntelligenceProvider,
} from './google-places-lookup.service';
import { ReverseLookupService } from './reverse-lookup.service';

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
  // Public premium badge derived from the user's subscription tier.
  badge: 'plus' | 'gold' | null;
  // Best-effort enrichment (carrier / line type / name) from an external provider
  // for numbers not in our own directory. Null when we already know the number,
  // when the number is suppressed, or when no provider is configured/available.
  external: NumberIntelligence | null;
  checkedAt: string;
}

// free → no badge; plus/gold show their badge publicly (status signal).
function tierToBadge(tier?: string): 'plus' | 'gold' | null {
  return tier === 'plus' || tier === 'gold' ? tier : null;
}

@Injectable()
export class LookupService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly businessService: BusinessService,
    private readonly suppression: SuppressionService,
    @Optional()
    @Inject(NUMBER_INTELLIGENCE)
    private readonly numberIntel?: NumberIntelligenceProvider,
    @Optional()
    private readonly reverseLookup?: ReverseLookupService,
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

  /**
   * Lean caller-ID path for the mobile app (via user.controller): resolve a public
   * business name for an unknown number from the external provider. Honors
   * suppression (POPIA — suppressed numbers are never sent to the provider),
   * normalizes ZA-local numbers to E.164, and records the billable lookup. Returns
   * null when suppressed, when no provider is configured, or when nothing matched.
   *
   * The returned name is external (Google) data: it may be shown live but must NOT
   * be persisted/cached by the caller (provider ToS).
   */
  async resolveExternalName(rawPhone: string): Promise<string | null> {
    const normalized = this.normalize(rawPhone || '');
    if (!/^\+?\d{5,15}$/.test(normalized)) return null;
    if (!this.numberIntel) return null;
    if (await this.suppression.isSuppressed(normalized)) return null;

    const e164 = normalized.startsWith('+')
      ? normalized
      : this.toIntlVariant(normalized) ?? '+' + normalized;
    const external = await this.numberIntel.lookup(e164);
    if (this.reverseLookup) {
      this.reverseLookup
        .record({ phoneNumber: e164, result: external, cached: false })
        .catch(() => {});
    }
    return external?.callerName ?? null;
  }

  async lookup(rawPhone: string): Promise<LookupResult> {
    const normalized = this.normalize(rawPhone || '');

    // E.164-ish format check: optional leading +, then 5–15 digits.
    if (!/^\+?\d{5,15}$/.test(normalized)) {
      throw new BadRequestException(
        'Invalid phone number format. Use digits with an optional leading +.',
      );
    }

    // POPIA/GDPR opt-out: a suppressed (unlisted) number must reveal nothing —
    // no identity, business, badge or community reports — even if registered.
    if (await this.suppression.isSuppressed(normalized)) {
      return {
        phoneNumber: normalized,
        found: false,
        status: 'not_registered',
        flags: { globalSpam: false, userReports: 0, blocked: false },
        business: null,
        badge: null,
        external: null,
        checkedAt: new Date().toISOString(),
      };
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

    // A number counts as "registered" only if it's a REAL user (not an
    // auto-created placeholder) or it resolves to a business number. Placeholders
    // are created by caller-ID lookups (name 'Unknown' + a @probo.local email) and
    // must read as unregistered, so the external fallback runs for them instead of
    // reporting "Registered · In Good Standing".
    const callerIdentity = await this.businessService.resolveCallerIdentity(canonical);
    const isPlaceholder = !!user && user.name === 'Unknown' && !!user.email?.endsWith('@probo.local');
    const isRegistered = (!!user && !isPlaceholder) || !!callerIdentity;

    // Community reports apply to registered and unregistered numbers alike.
    const userReports = await this.countCommunityReports(canonical);

    if (!isRegistered) {
      // Unknown to us — fall back to the external provider (Google Places) for a
      // public business name. Best-effort; null if unavailable. The name is shown
      // live but never persisted (provider ToS). The provider needs a country code
      // (it resolves E.164 only), so convert ZA-local (0…) numbers to +27 first.
      const e164 = canonical.startsWith('+')
        ? canonical
        : this.toIntlVariant(canonical) ?? '+' + canonical;
      const external = this.numberIntel ? await this.numberIntel.lookup(e164) : null;
      // Log the (billable) lookup for the admin dashboard — fire-and-forget so a
      // logging failure never breaks the user-facing lookup.
      if (this.numberIntel && this.reverseLookup) {
        this.reverseLookup
          .record({ phoneNumber: e164, result: external, cached: false })
          .catch(() => {});
      }
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
        badge: null,
        external,
        checkedAt,
      };
    }

    // Registered: a real user and/or a business number. We never expose
    // user.name / email / id / balance through the public lookup.
    const business = callerIdentity?.businessProfile
      ? {
          name: callerIdentity.businessProfile.companyName,
          verified: callerIdentity.businessProfile.verified,
          industry: callerIdentity.businessProfile.industry,
          purposeLabel: callerIdentity.numberPurposeLabel,
        }
      : null;

    const isSpam = !!user?.isSpam;
    let status: LookupStatus;
    if (isSpam) status = 'spam';
    else if (business?.verified) status = 'verified_business';
    else if (userReports >= COMMUNITY_BLOCK_THRESHOLD) status = 'flagged';
    else status = 'clean';

    return {
      phoneNumber: canonical,
      found: true,
      status,
      flags: {
        globalSpam: isSpam,
        userReports,
        blocked: isSpam || userReports >= COMMUNITY_BLOCK_THRESHOLD,
      },
      business,
      badge: tierToBadge((user as any)?.tier),
      external: null,
      checkedAt,
    };
  }
}
