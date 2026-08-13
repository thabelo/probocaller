import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppInstall } from '../marketplace/app-install.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { SurveyFilters } from './survey.entity';

/** The app whose install IS the consent to be matched for surveys (§2.2). */
export const RESPONDENT_APP_KEY = 'surveys';

/**
 * Does one person's profile satisfy a survey's filters?
 *
 * Filters are keyed by the profile fields Databroker already prices
 * (`age_range`, `province`, `industry_sector`, …) rather than a parallel
 * taxonomy — so age targets the BAND a user picked, never a number nobody
 * stored. A value may be a single accepted value or a list of them.
 */
export function matchesFilters(
  filters: SurveyFilters,
  profileData: Record<string, unknown>,
): boolean {
  for (const [field, wanted] of Object.entries(filters ?? {})) {
    const accepted = (Array.isArray(wanted) ? wanted : [wanted])
      .filter((v) => v !== '' && v !== null && v !== undefined);

    // An empty filter is "no preference", not "match nobody".
    if (!accepted.length) continue;

    const held = profileData?.[field];
    // Never treat an unanswered field as a match: a business paid to reach
    // people who said something, not people who said nothing.
    if (held === undefined || held === null || held === '') return false;

    if (!accepted.some((value) => String(value) === String(held))) return false;
  }
  return true;
}

/**
 * Who a survey can reach, and how many of them there are.
 *
 * Matching requires an ACTIVE `surveys` install — installing that app IS the
 * consent to be matched (§2.2). It is deliberately NOT keyed off
 * `dataShareEnabled`: removing Databroker must not silently stop survey
 * invitations, since no copy anywhere warns that it would.
 */
@Injectable()
export class SurveyMatchingService {
  constructor(
    @InjectRepository(AppInstall)
    private readonly installRepository: Repository<AppInstall>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(ProfileField)
    private readonly fieldRepository: Repository<ProfileField>,
  ) {}

  /** User ids that consented to be matched and satisfy these filters. */
  async audience(filters: SurveyFilters): Promise<number[]> {
    const installs = await this.installRepository.find({
      where: { appKey: RESPONDENT_APP_KEY, uninstalledAt: IsNull() },
      select: ['userId'],
    });
    const consented = new Set(installs.map((i) => i.userId));
    if (!consented.size) return [];

    // Profile data is a JSON blob in a text column, so matching happens here
    // rather than in SQL. Fine at current scale; if the consenting population
    // grows large this wants a real jsonb column and an index.
    const profiles = await this.profileRepository.find();

    return profiles
      .filter((p) => consented.has(p.userId))
      .filter((p) => matchesFilters(filters, p.data ?? {}))
      .map((p) => p.userId);
  }

  /**
   * How many people a survey could reach. Shown before publishing so a business
   * can see when its filters are narrower than its response target — it may
   * still publish, and the unfilled remainder is refunded on expiry.
   */
  async estimateAudience(filters: SurveyFilters): Promise<number> {
    return (await this.audience(filters)).length;
  }

  /**
   * Reject a filter on a field that does not exist. A typo'd key matches
   * nobody, so without this a business could pay to publish a survey that can
   * never be answered.
   */
  async assertKnownFields(filters: SurveyFilters): Promise<void> {
    const keys = Object.keys(filters ?? {});
    if (!keys.length) return;

    const fields = await this.fieldRepository.find({ select: ['key'] });
    const known = new Set(fields.map((f) => f.key));

    const unknown = keys.filter((key) => !known.has(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown profile field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      );
    }
  }
}
