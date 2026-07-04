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
 * Accuracy-hardening for the lifetime 3% referral commission, against a REAL
 * Postgres DB through the production CallService.completeCall money path.
 *
 * These target the ways profit-sharing can silently go wrong with real money:
 *   - replaying a completed call double-paying the referrer,
 *   - paying 3% on the gross instead of the actually-collected (capped) amount,
 *   - the commission being taken from the referee/business instead of platform-funded,
 *   - rounding drift across many small calls,
 *   - one referrer's commission leaking onto another.
 */
describe('Referral 3% — accuracy hardening (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let callService: CallService;
  let users: Repository<User>;
  let calls: Repository<CallLog>;
  let txns: Repository<Transaction>;

  const RATE = 0.1;
  const COMMISSION = 0.03;
  const userIds: number[] = [];
  const callIds: number[] = [];
  let seq = 0;
  const tag = () => `acc${Date.now()}_${seq++}`;

  const mkUser = async (over: Partial<User> = {}) => {
    const u = await users.save(
      users.create({ phoneNumber: `+27${tag()}`, name: 'Acc', walletBalance: 0, ...over }),
    );
    userIds.push(u.id);
    return u;
  };
  const mkBusiness = (balance: number) => mkUser({ name: 'Biz', isBusiness: true, walletBalance: balance });

  // One real business call from `business` to `earner`, completed. Returns the
  // financials the system actually computed (read back off the call row).
  const runCall = async (earnerId: number, businessId: number, duration: number) => {
    const call = await calls.save(
      calls.create({ fromUserId: earnerId, toUserId: businessId, status: 'initiated', ratePerSecond: RATE }),
    );
    callIds.push(call.id);
    await callService.completeCall(earnerId, call.id, duration);
    const done = await calls.findOne({ where: { id: call.id } });
    return {
      id: call.id,
      cost: Number(done!.cost),
      platformCut: Number(done!.platformCut),
      earned: Number(done!.userEarnings),
    };
  };

  const wallet = async (id: number) => Number((await users.findOne({ where: { id } }))!.walletBalance);
  const commissionRows = (referrerId: number) =>
    txns.find({ where: { userId: referrerId, type: 'REFERRAL_COMMISSION' } });

  beforeAll(async () => {
    moduleRef = await createIntegrationModule([
      TypeOrmModule.forFeature([User, CallLog, Transaction]),
      CallModule,
    ]);
    callService = moduleRef.get(CallService);
    users = moduleRef.get(getRepositoryToken(User));
    calls = moduleRef.get(getRepositoryToken(CallLog));
    txns = moduleRef.get(getRepositoryToken(Transaction));
  });

  afterAll(async () => {
    if (txns) await txns.delete({ userId: In(userIds) });
    if (calls && callIds.length) await calls.delete({ id: In(callIds) });
    if (users) await users.delete({ id: In(userIds) });
    if (moduleRef) await moduleRef.close();
  });

  it('does not double-pay the referrer when a completed call is replayed', async () => {
    const inviter = await mkUser();
    const biz = await mkBusiness(1000);
    const invitee = await mkUser({ referredBy: inviter.id });

    const { id, earned } = await runCall(invitee.id, biz.id, 60);
    const expected = round4(earned * COMMISSION);
    expect(await wallet(inviter.id)).toBeCloseTo(expected, 4);

    // Replay the exact same completion twice more.
    await callService.completeCall(invitee.id, id, 60);
    await callService.completeCall(invitee.id, id, 60);

    expect(await wallet(inviter.id)).toBeCloseTo(expected, 4); // unchanged
    expect(await commissionRows(inviter.id)).toHaveLength(1); // exactly one ledger row
  });

  it('pays 3% on the actually-collected earnings when the business wallet caps the charge', async () => {
    const inviter = await mkUser();
    const biz = await mkBusiness(2); // only $2 funded
    const invitee = await mkUser({ referredBy: inviter.id });

    // 100s * $0.1 = $10 gross, but only $2 is available → charge is capped at $2.
    const { cost, earned } = await runCall(invitee.id, biz.id, 100);

    expect(cost).toBeCloseTo(2, 4); // capped, not 10
    expect(await wallet(biz.id)).toBeCloseTo(0, 4); // floored, never negative
    // Commission is 3% of the CAPPED earnings, not the $10 gross.
    expect(await wallet(inviter.id)).toBeCloseTo(round4(earned * COMMISSION), 4);
    expect(await wallet(invitee.id)).toBeCloseTo(earned, 4);
  });

  it('is platform-funded: referee keeps 100%, referrer gets +3% extra, business charged exactly cost', async () => {
    const inviter = await mkUser();
    const biz = await mkBusiness(1000);
    const invitee = await mkUser({ referredBy: inviter.id });

    const { cost, platformCut, earned } = await runCall(invitee.id, biz.id, 50);
    const commission = round4(earned * COMMISSION);

    // Conservation: the business pays exactly cost = platformCut + earned.
    expect(cost).toBeCloseTo(platformCut + earned, 4);
    expect(await wallet(biz.id)).toBeCloseTo(1000 - cost, 4);
    // The referee is NOT docked to fund the commission — they keep the full earning.
    expect(await wallet(invitee.id)).toBeCloseTo(earned, 4);
    // The referrer's 3% is on top, not carved out of the referee or the business cut.
    expect(await wallet(inviter.id)).toBeCloseTo(commission, 4);
    expect(commission).toBeGreaterThan(0);
  });

  it('accumulates one commission row per call across many calls, summing to 3% of total with no rounding drift', async () => {
    const inviter = await mkUser();
    const biz = await mkBusiness(1000);
    const invitee = await mkUser({ referredBy: inviter.id });

    const durations = [7, 13, 29, 31, 50, 90, 120, 3]; // varied → varied earnings
    let expectedTotal = 0;
    for (const d of durations) {
      const { earned } = await runCall(invitee.id, biz.id, d);
      expectedTotal = round4(expectedTotal + round4(earned * COMMISSION)); // per-call rounding, accumulated
    }

    const rows = await commissionRows(inviter.id);
    expect(rows).toHaveLength(durations.length); // one row per call, none lost/merged
    const ledgerSum = round4(rows.reduce((s, r) => s + Number(r.amount), 0));
    expect(ledgerSum).toBeCloseTo(expectedTotal, 4);
    expect(await wallet(inviter.id)).toBeCloseTo(expectedTotal, 4);
  });

  it('pays one level only — commission does not cascade up the referral chain', async () => {
    // Chain: grandparent ← parent ← child. When the child earns, only the
    // child's direct referrer (parent) is paid; the grandparent gets nothing.
    const grandparent = await mkUser();
    const parent = await mkUser({ referredBy: grandparent.id });
    const child = await mkUser({ referredBy: parent.id });
    const biz = await mkBusiness(1000);

    const { earned } = await runCall(child.id, biz.id, 60);

    expect(await wallet(parent.id)).toBeCloseTo(round4(earned * COMMISSION), 4);
    expect(await commissionRows(parent.id)).toHaveLength(1);
    // Grandparent is two hops up — must receive zero.
    expect(await wallet(grandparent.id)).toBeCloseTo(0, 4);
    expect(await commissionRows(grandparent.id)).toHaveLength(0);
  });

  it('isolates commissions per referrer — no cross-referrer leakage', async () => {
    const r1 = await mkUser();
    const r2 = await mkUser();
    const biz = await mkBusiness(1000);
    const i1 = await mkUser({ referredBy: r1.id });
    const i2 = await mkUser({ referredBy: r2.id });

    const a = await runCall(i1.id, biz.id, 40);
    const b = await runCall(i2.id, biz.id, 75);

    // Each referrer earns 3% of ONLY their own invitee's earnings.
    expect(await wallet(r1.id)).toBeCloseTo(round4(a.earned * COMMISSION), 4);
    expect(await wallet(r2.id)).toBeCloseTo(round4(b.earned * COMMISSION), 4);
    expect(await commissionRows(r1.id)).toHaveLength(1);
    expect(await commissionRows(r2.id)).toHaveLength(1);
  });
});
