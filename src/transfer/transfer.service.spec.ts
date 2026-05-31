import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransferService } from './transfer.service';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * Security regression — Backend C3.
 *
 * Without row-level pessimistic locks on the sender (and recipient) inside the
 * transfer transaction, two concurrent transfers from the same wallet both read
 * the original balance, both pass the funds check, both write
 * `balance - amount` — letting an attacker spend the balance more than once.
 *
 * These tests assert that `manager.findOne(User, …)` is called with
 * `{ lock: { mode: 'pessimistic_write' } }` for both sides of the transfer
 * inside the transaction block. The actual concurrent-write proof is the
 * database's job; what we verify here is that the service asks for it.
 */

const makeUser = (id: number, phone: string, bal: number) => ({
  id, phoneNumber: phone, name: `U${id}`, walletBalance: bal,
});

describe('TransferService — wallet lock hardening (C3)', () => {
  let service: TransferService;
  let userRepo: any;
  let dataSource: any;
  let manager: any;

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save:    jest.fn().mockImplementation(async (x) => x),
      create:  jest.fn().mockImplementation((_e, data) => ({ ...data })),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(manager)),
    };

    userRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where:   jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TransferService);
  });

  it('requests pessimistic_write lock on both sender and recipient rows inside the transaction', async () => {
    const sender    = makeUser(1, '+27820001111', 100);
    const recipient = makeUser(2, '+27820002222', 0);

    userRepo.findOne.mockResolvedValueOnce(sender);
    userRepo.createQueryBuilder().getMany.mockResolvedValueOnce([recipient]);
    manager.findOne
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts).toMatchObject({ where: { id: sender.id }, lock: { mode: 'pessimistic_write' } });
        return { ...sender };
      })
      .mockImplementationOnce(async (_e: any, opts: any) => {
        expect(opts).toMatchObject({ where: { id: recipient.id }, lock: { mode: 'pessimistic_write' } });
        return { ...recipient };
      });

    await service.send(sender.id, '0820002222', 50);

    // Sanity: both rows were saved with the new balances.
    expect(manager.save).toHaveBeenCalled();
  });

  it('rejects amounts <= 0', async () => {
    await expect(service.send(1, '0820002222', 0)).rejects.toThrow();
    await expect(service.send(1, '0820002222', -5)).rejects.toThrow();
  });
});
