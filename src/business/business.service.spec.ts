import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';

const mockRepo = () => ({
  find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
  increment: jest.fn(), update: jest.fn(),
});

describe('BusinessService — API keys', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;
  let apiKeyRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(ApiKey), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
    apiKeyRepo = module.get(getRepositoryToken(ApiKey));
    apiKeyRepo.create.mockImplementation((x: any) => x);
    apiKeyRepo.save.mockImplementation(async (x: any) => x);
  });

  describe('createApiKey', () => {
    it('creates a pk_-prefixed key scoped to the given fields', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme' });
      const result = await service.createApiKey(3, { label: 'CRM', scopes: ['income_range', 'age_range'] });
      expect(result.key).toMatch(/^pk_[a-f0-9]{32,}$/);
      expect(result.businessId).toBe(3);
      expect(result.scopes).toEqual(['income_range', 'age_range']);
      expect(result.label).toBe('CRM');
      expect(apiKeyRepo.save).toHaveBeenCalled();
    });

    it('defaults scopes to all-fields (empty) and throws for a missing business', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3 });
      const noScope = await service.createApiKey(3, {});
      expect(noScope.scopes).toEqual([]);
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.createApiKey(9, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('generates a unique key per call', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3 });
      const a = (await service.createApiKey(3, {})).key;
      const b = (await service.createApiKey(3, {})).key;
      expect(a).not.toBe(b);
    });
  });

  describe('findActiveApiKey', () => {
    it('resolves an active key (with its business) and ignores revoked/blank', async () => {
      const key = { id: 1, key: 'pk_abc', revoked: false, business: { id: 3, userId: 7 } };
      apiKeyRepo.findOne.mockResolvedValue(key);
      expect(await service.findActiveApiKey('pk_abc')).toBe(key);
      expect(apiKeyRepo.findOne).toHaveBeenCalledWith({
        where: { key: 'pk_abc', revoked: false },
        relations: ['business'],
      });
      expect(await service.findActiveApiKey('')).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('marks a key revoked', async () => {
      const key: any = { id: 5, revoked: false };
      apiKeyRepo.findOne.mockResolvedValue(key);
      const res = await service.revokeApiKey(5);
      expect(key.revoked).toBe(true);
      expect(res.revoked).toBe(true);
    });
    it('throws for an unknown key', async () => {
      apiKeyRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeApiKey(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminListApiKeys', () => {
    it('lists all keys with their business, newest first', async () => {
      apiKeyRepo.find.mockResolvedValue([{ id: 1 }]);
      await service.adminListApiKeys();
      expect(apiKeyRepo.find).toHaveBeenCalledWith({ relations: ['business'], order: { createdAt: 'DESC' } });
    });
  });

  describe('recordApiKeyUsage', () => {
    it('increments the call count + spend and stamps lastUsedAt', async () => {
      await service.recordApiKeyUsage(5, 0.4);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'callCount', 1);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'totalSpend', 0.4);
      expect(apiKeyRepo.update).toHaveBeenCalled();
    });

    it('skips the spend increment when nothing was spent', async () => {
      await service.recordApiKeyUsage(5, 0);
      expect(apiKeyRepo.increment).toHaveBeenCalledWith({ id: 5 }, 'callCount', 1);
      expect(apiKeyRepo.increment).not.toHaveBeenCalledWith({ id: 5 }, 'totalSpend', expect.anything());
    });
  });
});
