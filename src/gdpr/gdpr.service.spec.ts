import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Withdrawal } from '../withdrawal/withdrawal.entity';
import { BankAccount } from '../bank-account/bank-account.entity';
import { UserProfile } from '../profile/user-profile.entity';

const repo = () => ({ findOne: jest.fn(), find: jest.fn() });

describe('GdprService.exportForUser', () => {
  let service: GdprService;
  let userRepo: any;
  let txRepo: any;
  let wRepo: any;
  let bankRepo: any;
  let profileRepo: any;

  beforeEach(async () => {
    userRepo = repo();
    txRepo = repo();
    wRepo = repo();
    bankRepo = repo();
    profileRepo = repo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: getRepositoryToken(Withdrawal), useValue: wRepo },
        { provide: getRepositoryToken(BankAccount), useValue: bankRepo },
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
      ],
    }).compile();
    service = module.get(GdprService);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.exportForUser(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bundles user PII, transactions, withdrawals, bankAccount, profile, and a generation timestamp', async () => {
    const user = { id: 1, phoneNumber: '+27821234567', email: 'a@b.co', name: 'Alice', walletBalance: 12.34 };
    const transactions = [{ id: 10, userId: 1, type: 'CREDIT', amount: 5, createdAt: new Date('2026-01-01') }];
    const withdrawals = [{ id: 20, userId: 1, amount: 100, status: 'paid' }];
    const bank = { id: 30, userId: 1, bankName: 'B', accountNumber: '1', accountType: 'savings', accountHolder: 'A' };
    const profile = { id: 40, userId: 1, fields: { age: 30 } };

    userRepo.findOne.mockResolvedValue(user);
    txRepo.find.mockResolvedValue(transactions);
    wRepo.find.mockResolvedValue(withdrawals);
    bankRepo.findOne.mockResolvedValue(bank);
    profileRepo.findOne.mockResolvedValue(profile);

    const out = await service.exportForUser(1);

    expect(out.user).toEqual(user);
    expect(out.transactions).toEqual(transactions);
    expect(out.withdrawals).toEqual(withdrawals);
    expect(out.bankAccount).toEqual(bank);
    expect(out.profile).toEqual(profile);
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.schemaVersion).toBe(1);
  });

  it('treats missing optional rows as null rather than throwing', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, phoneNumber: '+27', email: null, name: null });
    txRepo.find.mockResolvedValue([]);
    wRepo.find.mockResolvedValue([]);
    bankRepo.findOne.mockResolvedValue(null);
    profileRepo.findOne.mockResolvedValue(null);

    const out = await service.exportForUser(1);
    expect(out.bankAccount).toBeNull();
    expect(out.profile).toBeNull();
    expect(out.transactions).toEqual([]);
    expect(out.withdrawals).toEqual([]);
  });

  it('scopes every dependent query to the authenticated userId', async () => {
    userRepo.findOne.mockResolvedValue({ id: 7 });
    txRepo.find.mockResolvedValue([]);
    wRepo.find.mockResolvedValue([]);
    bankRepo.findOne.mockResolvedValue(null);
    profileRepo.findOne.mockResolvedValue(null);

    await service.exportForUser(7);
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(txRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7 } }));
    expect(wRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7 } }));
    expect(bankRepo.findOne).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(profileRepo.findOne).toHaveBeenCalledWith({ where: { userId: 7 } });
  });
});
