import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransferService } from './transfer.service';
import { PendingTransfer } from './pending-transfer.entity';
import { User } from '../user/user.entity';

/**
 * Held money only means anything if it actually reaches the person. Signup is
 * the moment that becomes possible, so it sweeps anything held for that number
 * into the new wallet.
 */
describe('TransferService.claimPendingFor', () => {
  let service: TransferService;
  let pendingRepo: any;
  let manager: any;
  let saved: any[];

  beforeEach(async () => {
    saved = [];
    pendingRepo = { find: jest.fn(async () => []), save: jest.fn() };
    manager = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => ({ id: 9, phoneNumber: '+27829998888', walletBalance: 0, notifications: [] })),
      create: jest.fn((_e: any, d: any) => ({ ...d })),
      save: jest.fn(async (x: any) => { saved.push(x); return x; }),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TransferService,
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PendingTransfer), useValue: pendingRepo },
        { provide: DataSource, useValue: { transaction: (cb: any) => cb(manager) } },
      ],
    }).compile();
    service = mod.get(TransferService);
  });

  const held = (over: any = {}) => ({
    id: 1, senderUserId: 1, recipientPhone: '+27829998888',
    amount: 25, note: null, status: 'pending', ...over,
  });

  it('credits the new user with everything held for their number', async () => {
    manager.find.mockResolvedValue([held(), held({ id: 2, amount: 10 })]);
    await service.claimPendingFor(9, '0829998888');
    const wallet = saved.flat().find((r: any) => r?.id === 9);
    expect(Number(wallet.walletBalance)).toBe(35);
  });

  it('marks each hold claimed, by whom and when', async () => {
    manager.find.mockResolvedValue([held()]);
    await service.claimPendingFor(9, '0829998888');
    const claimed = saved.flat().find((r: any) => r?.status === 'claimed');
    expect(claimed.claimedByUserId).toBe(9);
    expect(claimed.claimedAt).toBeInstanceOf(Date);
  });

  /** Most signups have nothing waiting — that must be silent and cheap. */
  it('is a no-op when nothing is held', async () => {
    manager.find.mockResolvedValue([]);
    await expect(service.claimPendingFor(9, '0829998888')).resolves.toBeDefined();
    expect(saved).toHaveLength(0);
  });

  it('looks up the hold by canonical E.164, not the typed form', async () => {
    manager.find.mockResolvedValue([]);
    await service.claimPendingFor(9, '0829998888');
    expect(manager.find.mock.calls[0][1].where.recipientPhone).toBe('+27829998888');
  });
});
