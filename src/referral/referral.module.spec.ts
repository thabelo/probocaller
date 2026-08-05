import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralModule } from './referral.module';
import { ReferralService } from './referral.service';
import { TransactionService } from '../transaction/transaction.service';
import { Setting } from '../config/setting.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * The module must actually PROVIDE what the service asks for.
 *
 * Every other test builds ReferralService by hand and hands it a Setting
 * repository, so they all passed while the real module supplied nothing — and
 * the app refused to boot: "Nest can't resolve dependencies of the
 * ReferralService (TransactionService, ?)". Unit tests cannot see that; this
 * compiles the module the way Nest does.
 */
describe('ReferralModule wiring', () => {
  it('can construct ReferralService from the module definition', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReferralModule],
    })
      // Stand in for the infrastructure the module imports, so this test is
      // about ReferralModule's own wiring and not the database.
      .overrideProvider(getRepositoryToken(Setting))
      .useValue({ findOne: jest.fn().mockResolvedValue(null) })
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({ find: jest.fn(), save: jest.fn() })
      .overrideProvider(TransactionService)
      .useValue({ log: jest.fn() })
      .compile();

    expect(moduleRef.get(ReferralService)).toBeInstanceOf(ReferralService);
  });

  it('resolves the configured rate through the injected repository', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReferralModule],
    })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue({ findOne: jest.fn().mockResolvedValue({ value: '0.07' }) })
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({ find: jest.fn(), save: jest.fn() })
      .overrideProvider(TransactionService)
      .useValue({ log: jest.fn() })
      .compile();

    await expect(moduleRef.get(ReferralService).getCommissionRate()).resolves.toBe(0.07);
  });
});
