import { DEFAULT_SETTINGS, seedSettings } from './seed-settings';
import { QUESTION_TYPES, feeSettingKey } from '../survey/question-type';

/**
 * The bootstrap settings seed, extracted out of AdminService so it can run
 * BEFORE provider instantiation rather than in AppModule.onModuleInit().
 *
 * Why it moved: UserModule builds ExternalLookupRateLimiter from an ASYNC
 * useFactory that reads EXTERNAL_LOOKUP_MAX_PER_WINDOW / _WINDOW_MS through
 * SettingsReaderService (which has no fallback and throws on a missing row).
 * Async factories resolve during provider instantiation — strictly before
 * onModuleInit — so a database missing any boot-time setting crash-looped and
 * could never seed itself. That took production down on 12 Aug 2026 and was
 * only cleared by inserting the two rows by hand.
 *
 * AdminService.seedDefaultConfig() now delegates here, so both callers seed
 * identically and the default list can never drift between them.
 */
describe('seedSettings', () => {
  let saved: any[];
  let repo: any;

  beforeEach(() => {
    saved = [];
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => { saved.push(d); return d; }),
    };
  });

  const prevEnv = process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
    else process.env.PAY_TO_CONTACT_PLATFORM_USER_ID = prevEnv;
  });

  it('seeds every default row when the settings table is empty', async () => {
    await seedSettings(repo);

    for (const def of DEFAULT_SETTINGS) {
      const row = saved.find((s) => s.key === def.key);
      expect(row).toBeDefined();
      expect(row.value).toBe(def.value);
      expect(String(row.description).length).toBeGreaterThan(0);
    }
  });

  it('never overwrites a row an admin has already tuned', async () => {
    repo.findOne.mockImplementation(async (opts: any) =>
      opts.where.key === 'RATE_PER_SECOND' ? { key: 'RATE_PER_SECOND', value: 'tuned' } : null);

    await seedSettings(repo);

    expect(saved.find((s) => s.key === 'RATE_PER_SECOND')).toBeUndefined();
  });

  /**
   * The two rows whose absence actually crash-looped boot — the async factory
   * reads exactly these, so the seed list is what stands between a fresh
   * database and an app that can never start.
   */
  it('includes the boot-time external-lookup limiter rows', () => {
    const keys = DEFAULT_SETTINGS.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining([
      'EXTERNAL_LOOKUP_MAX_PER_WINDOW',
      'EXTERNAL_LOOKUP_WINDOW_MS',
    ]));
  });

  /**
   * Surveys prices a response as the sum of its questions' type rates
   * (surveys-spec §1.1), read with no fallback — so every question type needs
   * its rate to exist before anything can be quoted or published.
   */
  it('seeds a base fee for every survey question type', async () => {
    await seedSettings(repo);

    for (const type of QUESTION_TYPES) {
      const row = saved.find((s) => s.key === feeSettingKey(type));
      expect(row).toBeDefined();
      expect(Number(row.value)).toBeGreaterThan(0);
    }
  });

  it('does NOT seed PAY_TO_CONTACT_PLATFORM_USER_ID without an env value', async () => {
    delete process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
    await seedSettings(repo);
    expect(saved.find((s) => s.key === 'PAY_TO_CONTACT_PLATFORM_USER_ID')).toBeUndefined();
  });

  it('migrates a configured PAY_TO_CONTACT_PLATFORM_USER_ID env value one time', async () => {
    process.env.PAY_TO_CONTACT_PLATFORM_USER_ID = '42';
    await seedSettings(repo);
    expect(saved.find((s) => s.key === 'PAY_TO_CONTACT_PLATFORM_USER_ID')?.value).toBe('42');
  });
});

/**
 * The phone number is priced in the platform's base currency, like the leads
 * base fee beside it — not in the fractional "credits" a profile field costs.
 * A number is worth orders of magnitude more than a demographic bucket, and
 * pricing it at 0.05 would have given it away.
 */
describe('seed-settings — the phone-number price', () => {
  const row = () => DEFAULT_SETTINGS.find((s) => s.key === 'PHONE_NUMBER_CREDIT_COST');

  it('defaults to R10 in the base currency', () => {
    expect(row()!.value).toBe('10');
  });

  it('says which currency that is, so an admin is not guessing', () => {
    expect(row()!.description).toMatch(/ZAR|base currency/i);
  });
});


/**
 * The two numbers that decide whether a survey may report back at all.
 *
 * They live in `settings` rather than in code because every other rule that
 * governs money or exposure on this platform is admin-tunable, and an operator
 * facing a regulator needs to be able to raise them without a deploy. They are
 * clamped one-way at the reader (survey-results.thresholds.ts) so tuning can
 * only ever make them stricter.
 */
describe('seed-settings — the survey results thresholds', () => {
  const row = (key: string) => DEFAULT_SETTINGS.find((s) => s.key === key);

  it('seeds the survey results thresholds', () => {
    expect(row('SURVEY_RESULTS_MIN_CELL')!.value).toBe('5');
    expect(row('SURVEY_RESULTS_RELEASE_THRESHOLD')!.value).toBe('10');
    expect(row('SURVEY_RESULTS_BATCH')!.value).toBe('10');
  });

  it('tells an admin these can only be raised', () => {
    for (const key of ['SURVEY_RESULTS_MIN_CELL', 'SURVEY_RESULTS_RELEASE_THRESHOLD', 'SURVEY_RESULTS_BATCH']) {
      expect(row(key)!.description).toMatch(/stricter|raise|lower/i);
    }
  });
});

/**
 * A budget rather than an anonymity guarantee, so unlike the results
 * thresholds these are tunable in BOTH directions — a panel that grows past a
 * few hundred people has a real case for asking more often, and nothing is
 * promised to a respondent about how many times they may be asked.
 */
describe('seed-settings — how often one business may come back', () => {
  const row = (key: string) => DEFAULT_SETTINGS.find((s) => s.key === key);

  it('seeds a repeat window and a per-respondent cap', () => {
    expect(row('SURVEY_REPEAT_WINDOW_DAYS')!.value).toBe('30');
    expect(row('SURVEY_MAX_PER_RESPONDENT')!.value).toBe('3');
  });

  it('says the cap is per business, not across the platform', () => {
    expect(row('SURVEY_MAX_PER_RESPONDENT')!.description).toMatch(/business/i);
  });
});
