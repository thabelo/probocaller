import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsReaderService } from './settings-reader.service';
import { Setting } from './setting.entity';

/**
 * SettingsReaderService is the SINGLE place every money-affecting rate is read
 * from the `settings` table. It intentionally has NO hardcoded fallback: every
 * consumer used to duplicate its own `DEFAULT_x` constant, which is exactly the
 * drift risk this class exists to remove. seedDefaultConfig() guarantees these
 * rows exist on every startup, so a genuinely missing/invalid row is real
 * misconfiguration and must fail loudly, not silently bill at a stale default.
 */
describe('SettingsReaderService.getNumber', () => {
  let service: SettingsReaderService;
  let repo: { findOne: jest.Mock };

  beforeEach(async () => {
    repo = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsReaderService,
        { provide: getRepositoryToken(Setting), useValue: repo },
      ],
    }).compile();
    service = module.get(SettingsReaderService);
  });

  it('returns the parsed numeric value when the setting row exists', async () => {
    repo.findOne.mockResolvedValue({ key: 'RATE_PER_SECOND', value: '0.002' });
    await expect(service.getNumber('RATE_PER_SECOND')).resolves.toBe(0.002);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { key: 'RATE_PER_SECOND' } });
  });

  it('throws when the setting row is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getNumber('MISSING_KEY')).rejects.toThrow(
      'Missing or invalid setting: MISSING_KEY',
    );
  });

  it('throws when the stored value does not parse to a finite number', async () => {
    repo.findOne.mockResolvedValue({ key: 'BROKEN', value: 'not-a-number' });
    await expect(service.getNumber('BROKEN')).rejects.toThrow(
      'Missing or invalid setting: BROKEN',
    );
  });
});
