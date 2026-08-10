import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmsLogService } from './sms-log.service';
import { SmsLog } from './sms-log.entity';

/**
 * Per-user SMS activity log. `create` never receives or stores message
 * content — only the device-computed hash, sender address, and the policy
 * category/decision that was applied.
 */
describe('SmsLogService', () => {
  let service: SmsLogService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, createdAt: new Date(), ...data })),
      find: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsLogService,
        { provide: getRepositoryToken(SmsLog), useValue: repo },
      ],
    }).compile();
    service = mod.get(SmsLogService);
  });

  describe('create', () => {
    it('normalises the address before storing', async () => {
      const dto = {
        address: '072 123 4567',
        bodyHash: 'a'.repeat(32),
        category: 'contacts',
        decision: 'free',
      } as any;

      const log = await service.create(42, dto);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        userId: 42,
        address: '+27721234567',
        bodyHash: 'a'.repeat(32),
        category: 'contacts',
        decision: 'free',
      }));
      expect(log.userId).toBe(42);
      expect(log.address).toBe('+27721234567');
    });

    it('does not normalise the bodyHash (it is opaque, not a phone number)', async () => {
      const dto = {
        address: '+27821234567',
        bodyHash: 'b'.repeat(32),
        category: 'business',
        decision: 'paid',
      } as any;

      const log = await service.create(1, dto);

      expect(log.bodyHash).toBe('b'.repeat(32));
    });
  });

  describe('findAllForUser', () => {
    it('returns only the given user\'s rows, newest first', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAllForUser(42);

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 42 },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
