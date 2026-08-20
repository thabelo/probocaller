import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyMatchingService, matchesFilters } from './survey-matching.service';
import { AppInstall } from '../marketplace/app-install.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { ProfileField } from '../profile/profile-field.entity';

/**
 * Who gets asked (surveys-spec §3.2).
 *
 * Filters are keyed by the SAME profile fields Databroker already prices —
 * `age_range`, `province`, `industry_sector` — not a parallel taxonomy. Age is
 * a band the user picked, not a number, so a survey targets bands.
 */
describe('matchesFilters', () => {
  const profile = { age_range: '25_34', province: 'Gauteng', industry_sector: 'insurance' };

  it('matches everyone when no filter is set', () => {
    expect(matchesFilters({}, profile)).toBe(true);
    expect(matchesFilters({}, {})).toBe(true);
  });

  it('matches an exact field value', () => {
    expect(matchesFilters({ province: 'Gauteng' }, profile)).toBe(true);
    expect(matchesFilters({ province: 'Limpopo' }, profile)).toBe(false);
  });

  /** Several bands are a legitimate target: 25–34 OR 35–44. */
  it('accepts any of several allowed values for one field', () => {
    expect(matchesFilters({ age_range: ['25_34', '35_44'] }, profile)).toBe(true);
    expect(matchesFilters({ age_range: ['45_54', '55_64'] }, profile)).toBe(false);
  });

  it('requires every filter to match, not just one', () => {
    expect(matchesFilters({ province: 'Gauteng', industry_sector: 'insurance' }, profile)).toBe(true);
    expect(matchesFilters({ province: 'Gauteng', industry_sector: 'mining' }, profile)).toBe(false);
  });

  /**
   * A filter on a field the person never filled in must NOT match. Treating a
   * blank as a match would send an insurance-worker survey to someone who never
   * said what they do, and the business paid for that targeting.
   */
  it('does not match a profile that never answered the filtered field', () => {
    expect(matchesFilters({ industry_sector: 'insurance' }, { province: 'Gauteng' })).toBe(false);
  });

  it('ignores an empty filter value rather than matching nobody', () => {
    expect(matchesFilters({ province: '' }, profile)).toBe(true);
    expect(matchesFilters({ province: [] }, profile)).toBe(true);
  });
});

describe('SurveyMatchingService', () => {
  let service: SurveyMatchingService;
  let installRepo: any;
  let profileRepo: any;
  let fieldRepo: any;

  const PROFILES = [
    { userId: 1, data: { age_range: '25_34', province: 'Gauteng', industry_sector: 'insurance' } },
    { userId: 2, data: { age_range: '35_44', province: 'Gauteng', industry_sector: 'mining' } },
    { userId: 3, data: { age_range: '25_34', province: 'Western Cape' } },
    { userId: 4, data: { age_range: '25_34', province: 'Gauteng', industry_sector: 'insurance' } },
  ];

  beforeEach(async () => {
    // Users 1–3 hold the surveys app; user 4 does not.
    installRepo = {
      find: jest.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }, { userId: 3 }]),
    };
    profileRepo = { find: jest.fn().mockResolvedValue(PROFILES) };
    fieldRepo = {
      find: jest.fn().mockResolvedValue([
        { key: 'age_range' }, { key: 'province' }, { key: 'industry_sector' },
      ]),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyMatchingService,
        { provide: getRepositoryToken(AppInstall), useValue: installRepo },
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
        { provide: getRepositoryToken(ProfileField), useValue: fieldRepo },
      ],
    }).compile();

    service = mod.get(SurveyMatchingService);
  });

  /**
   * Installing `surveys` IS the consent to be matched (§2.2) — and it is
   * deliberately NOT keyed off dataShareEnabled, so removing Databroker does
   * not silently stop survey invitations.
   */
  it('only counts people who hold the surveys app', async () => {
    await service.estimateAudience({});
    expect(installRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ appKey: 'surveys' }) }),
    );
  });

  it('counts everyone with the app when nothing is filtered', async () => {
    await expect(service.estimateAudience({})).resolves.toBe(3);
  });

  it('counts only the people a filter actually matches', async () => {
    await expect(service.estimateAudience({ province: 'Gauteng' })).resolves.toBe(2);
    await expect(service.estimateAudience({ industry_sector: 'insurance' })).resolves.toBe(1);
  });

  /** User 4 matches on paper but never installed the app, so is not reachable. */
  it('excludes a matching person who does not hold the app', async () => {
    await expect(
      service.estimateAudience({ province: 'Gauteng', industry_sector: 'insurance' }),
    ).resolves.toBe(1);
  });

  describe('validating a filter', () => {
    it('accepts filters keyed by real profile fields', async () => {
      await expect(service.assertKnownFields({ province: 'Gauteng' })).resolves.toBeUndefined();
    });

    /**
     * A typo'd key would match nobody, and the business would pay to publish a
     * survey that can never be answered.
     */
    it('rejects a filter on a field that does not exist', async () => {
      await expect(service.assertKnownFields({ provnce: 'Gauteng' })).rejects.toThrow(/provnce/);
    });
  });
});

/**
 * Interests are a multi-select: one person holds several industries at once,
 * and "All" means every one of them.
 *
 * The comparison used to stringify whatever was held, so an array of interests
 * became "telecoms,health" and matched a Telecoms filter only by accident of
 * spelling. A business paying to reach people interested in Health would have
 * silently reached nobody who listed more than one industry.
 */
describe('matchesFilters — multi-select answers', () => {
  const { matchesFilters } = require('./survey-matching.service');

  it('matches when one of the held values is wanted', () => {
    expect(matchesFilters({ interests: ['health'] }, { interests: ['telecoms', 'health'] })).toBe(true);
  });

  it('does not match when none of the held values is wanted', () => {
    expect(matchesFilters({ interests: ['insurance'] }, { interests: ['telecoms', 'health'] })).toBe(false);
  });

  it('still matches a single held value', () => {
    expect(matchesFilters({ interests: ['health'] }, { interests: 'health' })).toBe(true);
  });

  /** Someone who said "All" is interested in whatever is asked. */
  it('treats "all" as matching every filter', () => {
    expect(matchesFilters({ interests: ['insurance'] }, { interests: ['all'] })).toBe(true);
    expect(matchesFilters({ interests: ['telecoms'] }, { interests: ['all'] })).toBe(true);
  });

  /** An empty list is an unanswered field, not a match. */
  it('does not treat an empty selection as an answer', () => {
    expect(matchesFilters({ interests: ['health'] }, { interests: [] })).toBe(false);
  });
});
