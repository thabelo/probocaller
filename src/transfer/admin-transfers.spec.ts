import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransferService } from './transfer.service';
import { PendingTransfer } from './pending-transfer.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

/**
 * Admin oversight of person-to-person money.
 *
 * Money sent to someone who is not on ProboCaller does not land anywhere a
 * person can see — it waits in pending_transfers until that number signs up. If
 * nobody can view those, unclaimed money is invisible: an expiring hold, a typo
 * in a number, or a sender insisting they paid all become unanswerable.
 *
 * Completed transfers live in `transactions` and held ones in
 * `pending_transfers`, so the admin list has to merge the two.
 */
describe('TransferService.listForAdmin', () => {
  let service: TransferService;
  let pendingRepo: any;
  let txRepo: any;
  let userRepo: any;

  const held = (over: any = {}) => ({
    id: 12,
    senderUserId: 1,
    recipientPhone: '+27829998888',
    amount: '25.0000',
    note: 'lunch',
    status: 'pending',
    claimedByUserId: null,
    claimedAt: null,
    expiresAt: new Date('2026-09-04T00:00:00Z'),
    createdAt: new Date('2026-08-05T00:00:00Z'),
    ...over,
  });

  const sentTx = (over: any = {}) => ({
    id: 345,
    userId: 1,
    type: 'P2P_SEND',
    amount: '-40.0000',
    description: 'Transfer to Mpho Ndlovu',
    reference: 'P2P-1-2',
    createdAt: new Date('2026-08-04T00:00:00Z'),
    ...over,
  });

  beforeEach(async () => {
    pendingRepo = { find: jest.fn(async () => []), save: jest.fn() };
    txRepo = { find: jest.fn(async () => []) };
    userRepo = {
      find: jest.fn(async () => [
        { id: 1, name: 'Thabelo', phoneNumber: '+27824975852' },
      ]),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TransferService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(PendingTransfer), useValue: pendingRepo },
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = mod.get(TransferService);
  });

  it('lists money held for someone who has not signed up', async () => {
    pendingRepo.find.mockResolvedValue([held()]);
    const rows = await service.listForAdmin();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        recipientPhone: '+27829998888',
        amount: 25,
        status: 'held',
        note: 'lunch',
      }),
    );
  });

  it('lists completed transfers alongside held ones', async () => {
    pendingRepo.find.mockResolvedValue([held()]);
    txRepo.find.mockResolvedValue([sentTx()]);
    const rows = await service.listForAdmin();
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.status).sort()).toEqual(['completed', 'held']);
  });

  /** An amount shown as a negative debit would read as a refund. */
  it('reports a completed send as a positive amount', async () => {
    txRepo.find.mockResolvedValue([sentTx()]);
    const rows = await service.listForAdmin();
    expect(rows[0].amount).toBe(40);
  });

  it('names the sender rather than showing a bare id', async () => {
    pendingRepo.find.mockResolvedValue([held()]);
    const rows = await service.listForAdmin();
    expect(rows[0].senderName).toBe('Thabelo');
    expect(rows[0].senderPhone).toBe('+27824975852');
  });

  it('carries the claim through once the recipient has signed up', async () => {
    pendingRepo.find.mockResolvedValue([
      held({ status: 'claimed', claimedByUserId: 9, claimedAt: new Date('2026-08-06T00:00:00Z') }),
    ]);
    const rows = await service.listForAdmin();
    expect(rows[0].status).toBe('claimed');
    expect(rows[0].claimedAt).toEqual(new Date('2026-08-06T00:00:00Z'));
  });

  /** Newest first: an admin opening this is looking at what just happened. */
  it('orders newest first across both sources', async () => {
    pendingRepo.find.mockResolvedValue([held()]);              // Aug 5
    txRepo.find.mockResolvedValue([sentTx()]);                 // Aug 4
    const rows = await service.listForAdmin();
    expect(rows[0].status).toBe('held');
    expect(rows[1].status).toBe('completed');
  });

  it('returns an empty list rather than failing when there is nothing', async () => {
    await expect(service.listForAdmin()).resolves.toEqual([]);
  });
});
