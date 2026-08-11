import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Setting } from '../config/setting.entity';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * Cost-configuration cleanup: every money/limit constant that used to be a
 * bare process.env read or a hardcoded literal now lives in the settings
 * table, seeded here like every other admin-configurable rate.
 *
 * PAY_TO_CONTACT_PLATFORM_USER_ID is deliberately NOT part of this fixed
 * list — it identifies a specific environment's fee-collection wallet, not a
 * business constant, so it has its own describe block below.
 */
describe('AdminService.seedDefaultConfig — cost-configuration cleanup', () => {
  let service: AdminService;
  let saved: any[];
  let settingRepo: any;

  const noRepo = () => ({
    findOne: jest.fn(), find: jest.fn().mockResolvedValue([]),
    save: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    saved = [];
    settingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => { saved.push(d); return d; }),
      find: jest.fn().mockResolvedValue([]),
    };

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

  const cases: Array<{ key: string; value: string }> = [
    { key: 'WITHDRAWAL_PENDING_CAP', value: '3' },
    { key: 'AIRTIME_MIN_ZAR', value: '5' },
    { key: 'AIRTIME_MAX_ZAR', value: '1000' },
    { key: 'MAX_MONEY_MOVE', value: '1000000' },
    { key: 'MAX_TOPUP_AMOUNT', value: '1000' },
    { key: 'GOOGLE_PLACES_COST_USD', value: '0.017' },
    { key: 'EXTERNAL_LOOKUP_MAX_PER_WINDOW', value: '15' },
    { key: 'EXTERNAL_LOOKUP_WINDOW_MS', value: '60000' },
  ];

  it.each(cases)('seeds $key at the current bootstrap default', async ({ key, value }) => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === key);
    expect(row).toBeDefined();
    expect(row.value).toBe(value);
    expect(String(row.description).length).toBeGreaterThan(0);
  });

  it.each(cases)('never overwrites an existing $key row', async ({ key }) => {
    settingRepo.findOne.mockImplementation(async (opts: any) =>
      opts.where.key === key ? { key, value: 'tuned-by-admin' } : null);
    await service.seedDefaultConfig();
    expect(saved.find((s) => s.key === key)).toBeUndefined();
  });
});

describe('AdminService.seedDefaultConfig — PAY_TO_CONTACT_PLATFORM_USER_ID (no universal default)', () => {
  let settingRepo: any;
  let saved: any[];
  const noRepo = () => ({
    findOne: jest.fn(), find: jest.fn().mockResolvedValue([]),
    save: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });
  const prevEnv = process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;

  const build = async () => {
    saved = [];
    settingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => { saved.push(d); return d; }),
      find: jest.fn().mockResolvedValue([]),
    };
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
    return mod.get(AdminService);
  };

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
    else process.env.PAY_TO_CONTACT_PLATFORM_USER_ID = prevEnv;
  });

  it('does NOT seed a default row when no env value is currently configured', async () => {
    delete process.env.PAY_TO_CONTACT_PLATFORM_USER_ID;
    const service = await build();
    await service.seedDefaultConfig();
    expect(saved.find((s) => s.key === 'PAY_TO_CONTACT_PLATFORM_USER_ID')).toBeUndefined();
  });

  it('migrates the CURRENT env value as a one-time seed when one is set', async () => {
    process.env.PAY_TO_CONTACT_PLATFORM_USER_ID = '42';
    const service = await build();
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === 'PAY_TO_CONTACT_PLATFORM_USER_ID');
    expect(row).toBeDefined();
    expect(row.value).toBe('42');
  });
});
