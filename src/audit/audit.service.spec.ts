import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => ({ id: 1, createdAt: new Date(), ...x })),
      find: jest.fn(async () => []),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();
    service = mod.get(AuditService);
  });

  describe('record', () => {
    it('persists an audit entry, serializing metadata to JSON', async () => {
      await service.record({
        actorUserId: 7,
        action: 'admin.user.credit',
        targetType: 'user',
        targetId: '42',
        metadata: { amount: 5 },
        ip: '1.2.3.4',
      });
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({
        actorUserId: 7,
        action: 'admin.user.credit',
        targetType: 'user',
        targetId: '42',
        ip: '1.2.3.4',
      }));
      expect(JSON.parse(saved.metadata)).toEqual({ amount: 5 });
    });

    it('never throws if persistence fails — auditing must not break the action', async () => {
      repo.save.mockRejectedValue(new Error('db down'));
      await expect(service.record({ action: 'x' })).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns entries ordered by createdAt DESC, default limit 100', async () => {
      await service.list();
      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' }, take: 100 });
    });

    it('filters by action + actor and clamps the limit', async () => {
      await service.list({ action: 'gdpr.export', actorUserId: 9, limit: 10_000 });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { action: 'gdpr.export', actorUserId: 9 },
        take: 500,
      }));
    });
  });
});
