import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Setting } from '../config/setting.entity';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * The per-second business call rate is a Rand amount, like every other rate
 * in this table (see LEADS_BASE_FEE, correctly labelled "(ZAR)") — this
 * product is ZAR-denominated throughout (FxService base='ZAR', airtime is
 * Rand-only). Its description must never claim "(USD)".
 */
describe('AdminService.seedDefaultConfig — call rate currency label', () => {
  let service: AdminService;
  let saved: any[];
  let settingRepo: any;

  beforeEach(async () => {
    saved = [];
    settingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => { saved.push(d); return d; }),
      find: jest.fn().mockResolvedValue([]),
    };

    const noRepo = () => ({
      findOne: jest.fn(), find: jest.fn().mockResolvedValue([]),
      save: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(Setting), useValue: settingRepo },
        { provide: getRepositoryToken(User), useValue: noRepo() },
        { provide: getRepositoryToken(Transaction), useValue: noRepo() },
      ],
    })
      .useMocker(() => noRepo())
      .compile();

    service = mod.get(AdminService);
  });

  it('labels the currency as ZAR, not USD', async () => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === 'RATE_PER_SECOND');
    expect(row).toBeDefined();
    expect(String(row.description)).toContain('(ZAR)');
    expect(String(row.description)).not.toContain('USD');
  });
});
