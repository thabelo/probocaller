/**
 * One-off demo seeder (NOT a test): generates a REAL referral commission for an
 * existing inviter, through the production CallService.completeCall path, and
 * leaves the data in place so the mobile app can display it.
 *
 * Usage:
 *   INVITER_PHONE='+27...' npx ts-node test/seed-referral-demo.ts
 *
 * It finds the inviter by phone (e.g. the user you just logged into on the
 * emulator), creates a funded business + a fresh invitee referredBy the
 * inviter, runs one real business call, and prints the inviter's resulting
 * referral earnings (which /user/referral-code will now return to the app).
 */
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { createIntegrationModule } from './integration/harness';
import { CallModule } from '../src/call/call.module';
import { CallService } from '../src/call/call.service';
import { User } from '../src/user/user.entity';
import { CallLog } from '../src/call/call.entity';
import { Transaction } from '../src/transaction/transaction.entity';
import { round4 } from '../src/common/round4';

async function main() {
  const inviterPhone = process.env.INVITER_PHONE;
  if (!inviterPhone) throw new Error('Set INVITER_PHONE');
  const duration = Number(process.env.CALL_SECONDS || 120);
  const rate = Number(process.env.RATE || 0.1);

  const moduleRef = await createIntegrationModule([
    TypeOrmModule.forFeature([User, CallLog, Transaction]),
    CallModule,
  ]);
  const callService = moduleRef.get(CallService);
  const users = moduleRef.get(getRepositoryToken(User));
  const calls = moduleRef.get(getRepositoryToken(CallLog));
  const txns = moduleRef.get(getRepositoryToken(Transaction));

  const inviter = await users.findOne({ where: { phoneNumber: inviterPhone } });
  if (!inviter) throw new Error(`Inviter ${inviterPhone} not found — log into the app first`);

  const tag = `demo${Date.now()}`;
  const business = await users.save(
    users.create({ phoneNumber: `+27${tag}b`, name: 'Demo BizCo', isBusiness: true, walletBalance: 1000 }),
  );
  const invitee = await users.save(
    users.create({ phoneNumber: `+27${tag}i`, name: 'Demo Invitee', walletBalance: 0, referredBy: inviter.id }),
  );

  const call = await calls.save(
    calls.create({ fromUserId: invitee.id, toUserId: business.id, status: 'initiated', ratePerSecond: rate }),
  );
  await callService.completeCall(invitee.id, call.id, duration);

  const done = await calls.findOne({ where: { id: call.id } });
  const earned = Number(done!.userEarnings);
  const inviterAfter = await users.findOne({ where: { id: inviter.id } });
  const referralTotal = await txns
    .createQueryBuilder('t')
    .select('COALESCE(SUM(t.amount),0)', 'sum')
    .where('t.userId = :id', { id: inviter.id })
    .andWhere("t.type = 'REFERRAL_COMMISSION'")
    .getRawOne();

  console.log(JSON.stringify({
    inviterPhone,
    inviterId: inviter.id,
    inviteeEarned: earned,
    expected3pct: round4(earned * 0.03),
    inviterReferralEarnings: Number(referralTotal.sum),
    inviterWallet: Number(inviterAfter!.walletBalance),
  }, null, 2));

  await moduleRef.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
