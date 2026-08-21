import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyPricingService } from './survey-pricing.service';
import { PushService } from '../push/push.service';
import { SurveyMatchingService } from './survey-matching.service';
import { TransactionService } from '../transaction/transaction.service';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * SECURITY REGRESSION (money movement) — TOCTOU double-refund on close/expire.
 *
 * Reproduces a check-then-act race in SurveyPublishService. `close()` reads the
 * survey with `ownedSurvey()` (an UNLOCKED SELECT) and asserts `status === 'live'`
 * OUTSIDE the transaction, then `settle()` refunds from that same in-memory
 * survey object. Inside the transaction ONLY the Business row is locked
 * (`pessimistic_write`); the Survey row is never re-read or re-locked, and its
 * status is never re-verified under the lock. There is no @VersionColumn on
 * Survey and nothing else guards the second writer.
 *
 * Consequence: two `close()` requests for the same live survey that both read it
 * as 'live' (the concurrency window — the pessimistic lock on Business merely
 * serialises their settles, it does not stop the second one) each issue the full
 * escrow refund. The business wallet is credited TWICE for a hold that only ever
 * covered one refund, draining platform escrow into the caller's own wallet.
 * The same shape lets `publish()` double-DEBIT.
 *
 * The correct pattern already exists in this repo: SurveyResponseService.submit()
 * re-reads the Survey UNDER `pessimistic_write` and re-checks `status` inside the
 * transaction (survey-response.service.ts:187-195), backed by the
 * (surveyId,userId) unique index.
 *
 * This test models the window by resolving both close() reads as 'live' before
 * either settle runs (a yielding transaction mock + Promise.all). It asserts the
 * SAFE behaviour — the escrow is refunded at most once — and therefore FAILS
 * against the current code, which refunds twice. It is a red test that documents
 * the hole; it does not fix it.
 */
describe('SurveyPublishService — concurrent close must not double-refund escrow', () => {
  let service: SurveyPublishService;
  let business: { id: number; userId: number; walletBalance: any };
  let transactions: { log: jest.Mock };

  // A live survey whose whole hold is refundable on close: 0 delivered, so the
  // refund is the entire `totalHeld`.
  const LIVE = () => ({
    id: 100,
    businessId: 7,
    status: 'live',
    title: 'How are we doing?',
    targetResponses: 100,
    filtersJson: {},
    pricePerResponse: '3',
    totalHeld: '372',
    totalPaid: '0',
    publishedAt: new Date(),
    closedAt: null,
    expiresAt: null,
    business: { userId: 1 },
  });

  beforeEach(async () => {
    business = { id: 7, userId: 1, walletBalance: '0' };

    // The single mutable survey row FOR UPDATE reads and writes. Once the fix
    // re-reads the survey under lock and flips it to 'closed', the serialised
    // second settle sees that and does nothing — which is the whole fix.
    const lockedSurvey = LIVE();

    const manager = {
      // Business AND Survey are read/locked inside the transaction now, each a
      // single shared object so a committed write is visible to the next
      // (serialised) settle — exactly as two real FOR UPDATE transactions see
      // each other's committed rows.
      findOne: jest.fn(async (entity: any) =>
        entity === Business ? business : entity === Survey ? lockedSurvey : null,
      ),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (_e: any, row: any) => row),
      create: jest.fn((_e: any, row: any) => row),
    };

    // Every read of the survey returns a FRESH 'live' object — this is the race
    // window: in production both concurrent requests SELECT the row before either
    // transaction commits, so both observe status='live'.
    const surveyRepo = {
      findOne: jest.fn(async () => LIVE()),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (r: any) => r),
    };

    transactions = { log: jest.fn().mockResolvedValue({}) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyPublishService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyQuestion), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: SurveyPricingService, useValue: { quote: jest.fn(), pricePerResponse: jest.fn() } },
        { provide: SurveyMatchingService, useValue: { estimateAudience: jest.fn(), audience: jest.fn().mockResolvedValue([]) } },
        { provide: PushService, useValue: { sendToUser: jest.fn().mockResolvedValue({}) } },
        { provide: getRepositoryToken(User), useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() } },
        { provide: TransactionService, useValue: transactions },
        // Thresholds unset -> fall back to floors (releaseThreshold 10); with 0
        // delivered the survey "never reported", so the whole hold is refunded.
        { provide: SettingsReaderService, useValue: { getNumber: jest.fn(async () => NaN) } },
        {
          provide: DataSource,
          useValue: {
            // BOTH close() calls pass their OUTSIDE status==='live' check (a
            // fresh unlocked read each — the concurrency window) before either
            // transaction runs. The transactions themselves SERIALISE, modelling
            // the pessimistic_write lock: the second only runs after the first
            // commits. Old code refunds from its own unlocked survey object and
            // double-refunds anyway (744); the fix re-reads the now-'closed' row
            // under the lock and refunds once (372).
            transaction: (() => {
              let chain: Promise<unknown> = Promise.resolve();
              return (fn: any) => {
                const run = chain.then(() => fn(manager));
                chain = run.catch(() => undefined);
                return run;
              };
            })(),
          },
        },
      ],
    }).compile();

    service = mod.get(SurveyPublishService);
  });

  it('refunds the escrow at most once when two closes race the same live survey', async () => {
    await Promise.all([service.close(1, 100), service.close(1, 100)]);

    const refunds = transactions.log.mock.calls.filter(
      (c: any[]) => c[1] === 'SURVEY_ESCROW_REFUNDED',
    );

    // SAFE expectation: the hold (372) is refunded exactly once. The current
    // code refunds twice (wallet 744, two ledger rows), so this FAILS — which is
    // the vulnerability being reported.
    expect(refunds).toHaveLength(1);
    expect(Number(business.walletBalance)).toBe(372);
  });
});
