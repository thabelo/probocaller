import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Setting } from '../config/setting.entity';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';
import { REFERRAL_RATE_KEY, DEFAULT_COMMISSION_RATE } from '../referral/referral.service';

/**
 * The referral commission rate is operational policy, not deployment config.
 * It has to appear in the settings table like every other rate, or it cannot be
 * edited from the admin panel and the apps have nothing to read.
 */
describe('AdminService.seedDefaultConfig — referral commission', () => {
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

  it('seeds the referral commission rate so an admin can change it', async () => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === REFERRAL_RATE_KEY);
    expect(row).toBeDefined();
    expect(Number(row.value)).toBe(DEFAULT_COMMISSION_RATE);
  });

  it('describes it in terms an admin can act on', async () => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === REFERRAL_RATE_KEY);
    expect(String(row.description)).toMatch(/referr/i);
  });

  /** Seeding must never overwrite a rate an admin has already tuned. */
  it('leaves an existing configured rate alone', async () => {
    settingRepo.findOne.mockImplementation(async (opts: any) =>
      opts.where.key === REFERRAL_RATE_KEY ? { key: REFERRAL_RATE_KEY, value: '0.09' } : null);
    await service.seedDefaultConfig();
    expect(saved.find((s) => s.key === REFERRAL_RATE_KEY)).toBeUndefined();
  });
});
