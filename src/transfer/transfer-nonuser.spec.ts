import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { TransferService } from './transfer.service';
import { PendingTransfer } from './pending-transfer.entity';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * Sending to someone who is not on ProboCaller used to be refused outright
 * ("Recipient is not on Probo"). It now debits the sender and HOLDS the amount
 * until that number signs up.
 *
 * Holding it — rather than crediting a placeholder account — keeps real money
 * out of a wallet belonging to an unverified number that nobody controls.
 */
describe('TransferService — sending to a non-user', () => {
  let service: TransferService;
  let userRepo: any;
  let manager: any;
  let saved: any[];

  const sender = () => ({ id: 1, phoneNumber: '+27821110000', name: 'Sender', walletBalance: 100 });

  beforeEach(async () => {
    saved = [];
    userRepo = {
      findOne: jest.fn(async () => sender()),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        // nobody on ProboCaller has this number
        getMany: jest.fn(async () => []),
      })),
    };

    manager = {
      findOne: jest.fn(async (_e: any, opts: any) => (opts?.where?.id === 1 ? sender() : null)),
      create: jest.fn((_e: any, d: any) => ({ __entity: _e?.name, ...d })),
      save: jest.fn(async (x: any) => { saved.push(x); return x; }),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TransferService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(PendingTransfer), useValue: { find: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(Transaction), useValue: { find: jest.fn(async () => []) } },
        { provide: DataSource, useValue: { transaction: (cb: any) => cb(manager) } },
      ],
    }).compile();
    service = mod.get(TransferService);
  });

  const flat = () => saved.flat();

  /**
   * Uploading a phonebook creates a User row per contact, so a match in `users`
   * does not mean the person signed up. Crediting that row pays a wallet nobody
   * has ever logged into AND reports recipientOnProbo:true, so the app skips the
   * SMS and the recipient is never told the money exists.
   */
  it('holds the money when the only match is a phonebook row, not a member', async () => {
    userRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        { id: 348, phoneNumber: '0829998888', name: 'Unknown', referralCode: null, walletBalance: 0 },
      ]),
    }));
    const res: any = await service.send(1, '0829998888', 25);
    expect(res.recipientOnProbo).toBe(false);
    const held = flat().find((r: any) => r?.recipientPhone !== undefined);
    expect(held?.recipientPhone).toBe('+27829998888');
    // the phonebook row must not have been paid
    expect(flat().find((r: any) => r?.id === 348)).toBeUndefined();
  });

  it('no longer refuses a recipient who is not on ProboCaller', async () => {
    await expect(service.send(1, '0829998888', 25)).resolves.toBeTruthy();
  });

  it('debits the sender', async () => {
    await service.send(1, '0829998888', 25);
    const senderRow = flat().find((r: any) => r?.id === 1);
    expect(Number(senderRow.walletBalance)).toBe(75);
  });

  it('holds the amount against the recipient number in E.164', async () => {
    await service.send(1, '0829998888', 25);
    const held = flat().find((r: any) => r?.recipientPhone !== undefined);
    expect(held.recipientPhone).toBe('+27829998888');
    expect(Number(held.amount)).toBe(25);
    expect(held.status).toBe('pending');
    expect(held.senderUserId).toBe(1);
  });

  it('gives the hold an expiry so unclaimed money can be returned', async () => {
    await service.send(1, '0829998888', 25);
    const held = flat().find((r: any) => r?.recipientPhone !== undefined);
    expect(held.expiresAt).toBeInstanceOf(Date);
    expect(held.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('tells the caller the recipient is not yet a user, so the app can SMS them', async () => {
    const out: any = await service.send(1, '0829998888', 25);
    expect(out.pending).toBe(true);
    expect(out.recipientOnProbo).toBe(false);
  });

  /** The balance check must still hold for a pending transfer. */
  it('refuses to hold more than the sender has', async () => {
    await expect(service.send(1, '0829998888', 5000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still refuses sending to your own number', async () => {
    await expect(service.send(1, '0821110000', 5)).rejects.toBeInstanceOf(BadRequestException);
  });
});
