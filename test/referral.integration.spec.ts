import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createIntegrationModule } from './integration/harness';
import { CallModule } from '../src/call/call.module';
import { CallService } from '../src/call/call.service';
import { User } from '../src/user/user.entity';
import { CallLog } from '../src/call/call.entity';
import { Transaction } from '../src/transaction/transaction.entity';
import { round4 } from '../src/common/round4';

/**
 * End-to-end proof of the lifetime referral programme against a REAL Postgres
 * DB, through the actual call-completion money path (not a mocked unit).
 *
 * Scenario — 5 users + 1 funded business:
 *   - 1 inviter (referrer), empty wallet
 *   - 3 invitees, each referredBy = inviter
 *   - 1 control, NOT referred
 *   - 1 business caller funding the calls
 *
 * Each of the 4 earners receives a real business call of a different length, so
 * each earns a different amount. We then assert the inviter's wallet equals
 * exactly 3% of every invitee's earnings (and that the control produces none).
 */
describe('Referral 3% to inviter (integration, real Postgres): 5 users + real calls', () => {
  let moduleRef: TestingModule;
  let callService: CallService;
  let users: Repository<User>;
  let calls: Repository<CallLog>;
  let txns: Repository<Transaction>;

  const tag = `refit${Date.now()}`;
  const RATE = 0.1; // $/sec on each call
  const COMMISSION_RATE = 0.03; // the advertised 3%

  let inviterId: number;
  const allUserIds: number[] = [];
  const allCallIds: number[] = [];
  const earners: {
    name: string;
    referred: boolean;
    duration: number;
    earned: number;
  }[] = [];

  beforeAll(async () => {
    moduleRef = await createIntegrationModule([
      TypeOrmModule.forFeature([User, CallLog, Transaction]),
      CallModule,
    ]);
    callService = moduleRef.get(CallService);
    users = moduleRef.get(getRepositoryToken(User));
    calls = moduleRef.get(getRepositoryToken(CallLog));
    txns = moduleRef.get(getRepositoryToken(Transaction));

    // Inviter — empty wallet so its final balance is purely commissions.
    const inviter = await users.save(
      users.create({ phoneNumber: `+27${tag}0`, name: 'Inviter', referralCode: tag, walletBalance: 0 }),
    );
    inviterId = inviter.id;

    // Business caller — funds every call.
    const business = await users.save(
      users.create({ phoneNumber: `+27${tag}biz`, name: 'BizCo', isBusiness: true, walletBalance: 1000 }),
    );

    const plan = [
      { name: 'Invitee-1', referred: true, duration: 50 },
      { name: 'Invitee-2', referred: true, duration: 100 },
      { name: 'Invitee-3', referred: true, duration: 30 },
      { name: 'Control', referred: false, duration: 80 },
    ];

    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const earner = await users.save(
        users.create({
          phoneNumber: `+27${tag}${i + 1}`,
          name: p.name,
          walletBalance: 0,
          ...(p.referred ? { referredBy: inviterId } : {}),
        }),
      );
      // A real call from the business to the earner, then complete it — this is
      // the exact production path that credits the earner and pays the 3%.
      const call = await calls.save(
        calls.create({ fromUserId: earner.id, toUserId: business.id, status: 'initiated', ratePerSecond: RATE }),
      );
      await callService.completeCall(earner.id, call.id, p.duration);

      const done = await calls.findOne({ where: { id: call.id } });
      earners.push({ name: p.name, referred: p.referred, duration: p.duration, earned: Number(done!.userEarnings) });
      allUserIds.push(earner.id);
      allCallIds.push(call.id);
    }

    allUserIds.push(inviterId, business.id);
  });

  afterAll(async () => {
    // Clean up everything this spec created (FK order: txns → calls → users).
    if (txns) await txns.delete({ userId: In(allUserIds) });
    if (calls && allCallIds.length) await calls.delete({ id: In(allCallIds) });
    if (users) await users.delete({ id: In(allUserIds) });
    if (moduleRef) await moduleRef.close();
  });

  it('every earner actually earned from their completed call', () => {
    expect(earners).toHaveLength(4);
    for (const e of earners) expect(e.earned).toBeGreaterThan(0);
    // Different durations → genuinely different earnings (not a constant).
    expect(new Set(earners.map((e) => e.earned)).size).toBeGreaterThan(1);
  });

  it("credits the inviter exactly 3% of each invitee's earnings", async () => {
    const invitees = earners.filter((e) => e.referred);
    const expectedPer = invitees.map((e) => round4(e.earned * COMMISSION_RATE)).sort((a, b) => a - b);
    const expectedTotal = round4(expectedPer.reduce((a, b) => a + b, 0));

    // 1) Inviter's wallet (started at 0) equals the sum of 3% commissions.
    const inviter = await users.findOne({ where: { id: inviterId } });
    expect(Number(inviter!.walletBalance)).toBeCloseTo(expectedTotal, 4);

    // 2) Exactly one REFERRAL_COMMISSION ledger row per invitee...
    const rows = await txns.find({ where: { userId: inviterId, type: 'REFERRAL_COMMISSION' } });
    expect(rows).toHaveLength(invitees.length);

    // 3) ...and each row is precisely 3% of one invitee's earning.
    const rowAmounts = rows.map((r) => round4(Number(r.amount))).sort((a, b) => a - b);
    expect(rowAmounts).toEqual(expectedPer);
  });

  it('pays no commission for the non-referred control (no referrer ⇒ no 3%)', async () => {
    const invitees = earners.filter((e) => e.referred);
    // Only the invitees produced commissions; the control's earning added none.
    const rows = await txns.find({ where: { userId: inviterId, type: 'REFERRAL_COMMISSION' } });
    expect(rows).toHaveLength(invitees.length);
  });
});
