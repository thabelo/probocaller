import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdRevenueModule } from './ad-revenue.module';
import { AdRevenueService } from './ad-revenue.service';
import { TransactionService } from '../transaction/transaction.service';
import { Setting } from '../config/setting.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * The module must actually PROVIDE what the service asks for — unit tests build
 * the service by hand and would pass even if the real module supplied nothing,
 * leaving the app refusing to boot. This compiles the module the way Nest does.
 */
describe('AdRevenueModule wiring', () => {
  const settingRepo = (value: string | null) => ({
    findOne: jest.fn().mockResolvedValue(value === null ? null : { value }),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => d),
  });

  const build = (value: string | null) =>
    Test.createTestingModule({ imports: [AdRevenueModule] })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue(settingRepo(value))
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({ find: jest.fn(), save: jest.fn() })
      .overrideProvider(TransactionService)
      .useValue({ log: jest.fn() })
      .compile();

    it('can construct AdRevenueService from the module definition', async () => {
    const moduleRef = await build(null);
    expect(moduleRef.get(AdRevenueService)).toBeInstanceOf(AdRevenueService);
  });

  it('resolves the configured share rate through the injected repository', async () => {
    const moduleRef = await build('0.05');
    await expect(moduleRef.get(AdRevenueService).getShareRate()).resolves.toBe(0.05);
  });
});
