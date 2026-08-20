import { Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { QUESTION_TYPES, QuestionType, feeSettingKey } from '../survey/question-type';

/**
 * Base fee (ZAR) paid to a respondent per question, by type — a survey's price
 * per response is the sum of its questions' rates (surveys-spec §1.1). Priced
 * by the work asked of the person answering: free text takes real effort,
 * yes/no is a tap. Admin-tunable from the console afterwards; these are only
 * the bootstrap numbers.
 *
 * Typed as a full Record, so adding a question type without pricing it is a
 * compile error rather than an unseeded row that throws at publish time.
 */
const SURVEY_QUESTION_FEES: Record<QuestionType, string> = {
  free_text: '2.50',
  yes_no: '0.50',
  multiple_choice: '1.00',
  multi_select: '1.50',
  dropdown: '0.75',
};

/**
 * Every bootstrap-seeded row in the `settings` table, in one place.
 *
 * SettingsReaderService deliberately has NO fallback default — a missing row
 * throws — so this list is the single guarantee that every money-affecting
 * rate resolves on a fresh database.
 *
 * Adding a key here is enough for it to exist at boot: seedSettings() runs
 * from ConfigModule's SETTINGS_SEEDED provider (before any provider that
 * reads settings is instantiated) as well as from
 * AdminService.seedDefaultConfig().
 */
export const DEFAULT_SETTINGS: Array<{ key: string; value: string; description: string }> = [
  { key: 'RATE_PER_SECOND', value: '0.002', description: 'Charge per second for business calls (ZAR)' },
  { key: 'SMS_RATE_PER_MESSAGE', value: '0.05', description: 'Flat charge per SMS message (ZAR)' },
  { key: 'PHONE_NUMBER_CREDIT_COST', value: '10', description: 'Price of a lead\u2019s phone number in the base currency (ZAR), on top of the profile fields. Charged only when that user has phone sharing on. Priced like the leads base fee, not like a profile field\u2019s fractional credit cost \u2014 a number is worth far more than a demographic bucket.' },
  { key: 'PLATFORM_CUT_RATE', value: '0.24', description: 'Platform revenue share (0.24 = 24%)' },
  { key: 'REFERRAL_COMMISSION_RATE', value: '0.03', description: 'Lifetime referral commission paid to the referrer, platform-funded (0.03 = 3%). Set to 0 to switch the programme off.' },
  { key: 'LEADS_BASE_FEE', value: '250', description: 'Data-certificate base fee (ZAR) charged per user (per lead)' },
  { key: 'LEADS_FREE_DAYS', value: '7', description: 'Authorisation days the per-user base fee covers before interest applies' },
  { key: 'LEADS_DAILY_RATE', value: '0.018', description: 'Compounding interest per day on the base fee beyond the free window (0.018 = 1.8%/day)' },
  { key: 'LEADS_MAX_MULTIPLIER', value: '3', description: 'Cap on the compounded base-fee multiplier so long windows can’t run away (3 = at most 3× the base fee)' },
  { key: 'PAY_TO_CONTACT_FEE_RATE', value: '0.3', description: 'Platform fee rate on pay-to-contact requests (0.3 = 30%)' },
  { key: 'AD_REVENUE_SHARE_RATE', value: '0.078', description: 'Share of ad revenue paid to the opted-in user whose impressions produced it, platform-funded (0.078 = 7.8%). Set to 0 to switch the programme off.' },
  { key: 'WITHDRAWAL_PENDING_CAP', value: '3', description: 'Max concurrent pending withdrawals allowed per user' },
  { key: 'AIRTIME_MIN_ZAR', value: '5', description: 'Minimum airtime redemption amount (ZAR)' },
  { key: 'AIRTIME_MAX_ZAR', value: '1000', description: 'Maximum airtime redemption amount (ZAR)' },
  { key: 'MAX_MONEY_MOVE', value: '1000000', description: 'Sanity ceiling on any single wallet top-up/transfer amount (ZAR)' },
  { key: 'MAX_TOPUP_AMOUNT', value: '1000', description: "Maximum single wallet top-up amount (ZAR) — enforced in AddCreditDto's handler, not the decorator" },
  { key: 'GOOGLE_PLACES_COST_USD', value: '0.017', description: 'Per-lookup cost charged by the Google Places API (USD) — feeds the admin cost dashboard' },
  { key: 'EXTERNAL_LOOKUP_MAX_PER_WINDOW', value: '15', description: 'Max billable external lookups allowed per user per rate-limit window' },
  { key: 'EXTERNAL_LOOKUP_WINDOW_MS', value: '60000', description: 'Rate-limit window length in milliseconds for external lookup caps' },
  ...QUESTION_TYPES.map((type) => ({
    key: feeSettingKey(type),
    value: SURVEY_QUESTION_FEES[type],
    description: `Base fee (ZAR) earned per answered "${type.replace(/_/g, ' ')}" survey question — summed across a survey's questions to price one response`,
  })),
];

/**
 * Insert any missing bootstrap row. Idempotent, and never overwrites a value
 * an admin has tuned — an existing row always wins.
 */
export async function seedSettings(settingRepository: Repository<Setting>): Promise<void> {
  for (const def of DEFAULT_SETTINGS) {
    const existing = await settingRepository.findOne({ where: { key: def.key } });
    if (!existing) await settingRepository.save(settingRepository.create(def));
  }

  // PAY_TO_CONTACT_PLATFORM_USER_ID identifies a SPECIFIC user account as
  // this environment's fee-collection wallet — there is no universally-
  // correct default, so it is never bootstrap-seeded with a business-
  // constant value. If this environment currently has one configured via
  // env (a pre-migration deployment), seed that value ONE TIME so the
  // environment doesn't break; otherwise leave it unset so an admin must
  // explicitly configure it (reading it unset now throws loudly instead of
  // silently skipping platform-fee collection).
  const platformUserIdEnv = process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
  if (platformUserIdEnv) {
    const existing = await settingRepository.findOne({
      where: { key: 'PAY_TO_CONTACT_PLATFORM_USER_ID' },
    });
    if (!existing) {
      await settingRepository.save(settingRepository.create({
        key: 'PAY_TO_CONTACT_PLATFORM_USER_ID',
        value: platformUserIdEnv,
        description: 'Platform wallet (user id) that collects the Pay-to-Contact fee — must be explicitly configured by an admin; no bootstrap default.',
      }));
    }
  }
}
