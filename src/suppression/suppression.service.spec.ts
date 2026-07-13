import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuppressionService } from './suppression.service';
import { SuppressionEntry } from './suppression.entity';
import { hashNumber } from './number-hash';

describe('SuppressionService', () => {
  let service: SuppressionService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d: any) => ({ id: 1, ...d })),
      save: jest.fn().mockImplementation(async (x: any) => x),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppressionService,
        { provide: getRepositoryToken(SuppressionEntry), useValue: repo },
      ],
    }).compile();
    service = module.get(SuppressionService);
  });

  it('stores only the keyed hash of the number, never the plaintext', async () => {
    const res = await service.unlist('0821234567', 'stop calling me');
    expect(res.suppressed).toBe(true);
    expect(repo.save).toHaveBeenCalled();
    const saved = repo.create.mock.calls[0][0];
    expect(saved.numberHash).toBe(hashNumber('0821234567'));
    expect(JSON.stringify(saved)).not.toContain('0821234567');
    expect(JSON.stringify(saved)).not.toContain('+27821234567');
  });

  it('is idempotent — a second unlist does not create a duplicate', async () => {
    repo.findOne.mockResolvedValue({ id: 1, numberHash: hashNumber('0821234567') });
    const res = await service.unlist('0821234567');
    expect(repo.save).not.toHaveBeenCalled();
    expect(res.suppressed).toBe(true);
  });

  it('rejects an invalid phone number', async () => {
    await expect(service.unlist('nope')).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('isSuppressed reflects whether the hash exists', async () => {
    repo.count.mockResolvedValueOnce(1);
    expect(await service.isSuppressed('0821234567')).toBe(true);
    repo.count.mockResolvedValueOnce(0);
    expect(await service.isSuppressed('0821234567')).toBe(false);
  });

  it('filterSuppressed drops suppressed numbers and keeps the rest', async () => {
    repo.find.mockResolvedValue([{ numberHash: hashNumber('0821111111') }]);
    const out = await service.filterSuppressed(['0821111111', '0822222222']);
    expect(out).toEqual(['0822222222']);
  });
});
