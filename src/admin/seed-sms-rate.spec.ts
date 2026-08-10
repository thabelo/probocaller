import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Setting } from '../config/setting.entity';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

/**
 * SMS billing is a flat per-message rate, admin-configurable like every other
 * rate — it has to appear in the settings table or it can't be edited from the
 * admin panel and the apps have nothing to read.
 */
describe('AdminService.seedDefaultConfig — SMS rate', () => {
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

  it('seeds the SMS per-message rate so an admin can change it', async () => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === 'SMS_RATE_PER_MESSAGE');
    expect(row).toBeDefined();
    expect(Number(row.value)).toBe(0.05);
  });

  it('describes it in terms an admin can act on', async () => {
    await service.seedDefaultConfig();
    const row = saved.find((s) => s.key === 'SMS_RATE_PER_MESSAGE');
    expect(String(row.description)).toMatch(/sms|message/i);
  });

  /** Seeding must never overwrite a rate an admin has already tuned. */
  it('leaves an existing configured rate alone', async () => {
    settingRepo.findOne.mockImplementation(async (opts: any) =>
      opts.where.key === 'SMS_RATE_PER_MESSAGE' ? { key: 'SMS_RATE_PER_MESSAGE', value: '0.09' } : null);
    await service.seedDefaultConfig();
    expect(saved.find((s) => s.key === 'SMS_RATE_PER_MESSAGE')).toBeUndefined();
  });
});
