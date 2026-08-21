import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { AppInstall } from '../marketplace/app-install.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { DataAccessLog } from '../profile/data-access-log.entity';
import { SettingsReaderService } from '../config/settings-reader.service';
import { excludeOverSurveyed, readRepeatLimits } from './survey-repeat-limit';
import { SurveyFilters } from './survey.entity';

/** Who is asking, when that changes who may be asked. */
export interface AudienceOptions {
  /** The business publishing. Omit for the respondent's own view. */
  businessId?: number;
}

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

    const raw = profileData?.[field];
    // Never treat an unanswered field as a match: a business paid to reach
    // people who said something, not people who said nothing. An empty
    // multi-select is just as unanswered as a blank one.
    if (raw === undefined || raw === null || raw === '') return false;
    const held = (Array.isArray(raw) ? raw : [raw]).filter(
      (v) => v !== '' && v !== null && v !== undefined,
    );
    if (!held.length) return false;

    // Multi-select fields — Interests above all — hold several values at once,
    // and one overlap is a match. Stringifying the whole array instead would
    // turn ['telecoms','health'] into a value no filter can ever equal, quietly
    // excluding exactly the people who told us the most about themselves.
    //
    // 'all' is the opt-in-to-everything answer: someone who chose it is
    // interested in whatever is being asked.
    if (held.some((v) => String(v) === 'all')) continue;
    if (!accepted.some((value) => held.some((v) => String(value) === String(v)))) return false;
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
    @InjectRepository(DataAccessLog)
    private readonly accessLogRepository: Repository<DataAccessLog>,
    private readonly settingsReader: SettingsReaderService,
  ) {}

  /** User ids that consented to be matched and satisfy these filters. */
  async audience(filters: SurveyFilters, options: AudienceOptions = {}): Promise<number[]> {
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

    const matched = profiles
      .filter((p) => consented.has(p.userId))
      .filter((p) => matchesFilters(filters, p.data ?? {}))
      .map((p) => p.userId);

    return options.businessId == null
      ? matched
      : this.dropOverSurveyed(matched, options.businessId);
  }

  /**
   * Remove anyone this business has already read the cap of times lately.
   *
   * Every rule in the results pipeline protects a SINGLE survey, and none of
   * them compose: a business can clear all of them every week and still build
   * a long profile of the same dozen people out of individually compliant
   * results. Per-survey k is disclosure control, not a privacy budget.
   *
   * Enforced HERE rather than at publish, so the person is simply never
   * offered the survey. Refusing the publish instead would punish a business
   * for the composition of an audience it cannot see, and would leak that
   * these particular people had been surveyed before. If it drops the reach
   * below the publish floor, that refusal already says to widen the targeting.
   *
   * Counted off data_access_logs, which is the record of answers actually
   * RELEASED to this business — being invited, or answering into a cohort that
   * never opened, discloses nothing and should cost nobody their next survey.
   */
  private async dropOverSurveyed(audience: number[], businessId: number): Promise<number[]> {
    if (!audience.length) return audience;

    const { windowDays, maxPerRespondent } = await readRepeatLimits(this.settingsReader);
    if (maxPerRespondent <= 0) return audience;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await this.accessLogRepository.find({
      where: { businessId, purpose: 'survey_results', accessedAt: MoreThanOrEqual(since) },
      select: ['userId'],
    });

    const readCount = new Map<number, number>();
    for (const row of rows) {
      readCount.set(row.userId, (readCount.get(row.userId) ?? 0) + 1);
    }

    return excludeOverSurveyed(audience, readCount, maxPerRespondent);
  }

  /**
   * How many people a survey could reach. Shown before publishing so a business
   * can see when its filters are narrower than its response target — it may
   * still publish, and the unfilled remainder is refunded on expiry.
   */
  async estimateAudience(filters: SurveyFilters, options: AudienceOptions = {}): Promise<number> {
    return (await this.audience(filters, options)).length;
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
