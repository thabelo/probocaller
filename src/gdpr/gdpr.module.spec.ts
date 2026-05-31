import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GdprModule } from './gdpr.module';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Withdrawal } from '../withdrawal/withdrawal.entity';
import { BankAccount } from '../bank-account/bank-account.entity';
import { UserProfile } from '../profile/user-profile.entity';

const stub = {};

describe('GdprModule', () => {
  let module: TestingModule;
  beforeEach(async () => {
    module = await Test.createTestingModule({ imports: [GdprModule] })
      .overrideProvider(getRepositoryToken(User)).useValue(stub)
      .overrideProvider(getRepositoryToken(Transaction)).useValue(stub)
      .overrideProvider(getRepositoryToken(Withdrawal)).useValue(stub)
      .overrideProvider(getRepositoryToken(BankAccount)).useValue(stub)
      .overrideProvider(getRepositoryToken(UserProfile)).useValue(stub)
      .compile();
  });

  it('exposes GdprController and GdprService', () => {
    expect(module.get(GdprController)).toBeInstanceOf(GdprController);
    expect(module.get(GdprService)).toBeInstanceOf(GdprService);
  });
});
