import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { User } from '../user/user.entity';

const mockRepo = () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() });

describe('BusinessService — API keys', () => {
  let service: BusinessService;
  let businessRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get(BusinessService);
    businessRepo = module.get(getRepositoryToken(Business));
  });

  describe('generateApiKey', () => {
    it('generates a pk_-prefixed key, persists it, and returns key + business', async () => {
      const business: any = { id: 3, companyName: 'Acme', apiKey: null };
      businessRepo.findOne.mockResolvedValue(business);
      businessRepo.save.mockImplementation(async (b: any) => b);

      const result = await service.generateApiKey(3);

      expect(result.apiKey).toMatch(/^pk_[a-f0-9]{32,}$/);
      expect(business.apiKey).toBe(result.apiKey);
      expect(businessRepo.save).toHaveBeenCalledWith(business);
    });

    it('throws when the business does not exist', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.generateApiKey(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rotates the key on each call (old key stops working)', async () => {
      const business: any = { id: 3, apiKey: 'pk_old' };
      businessRepo.findOne.mockResolvedValue(business);
      businessRepo.save.mockImplementation(async (b: any) => b);
      const first = (await service.generateApiKey(3)).apiKey;
      const second = (await service.generateApiKey(3)).apiKey;
      expect(first).not.toBe(second);
    });
  });

  describe('findByApiKey', () => {
    it('resolves the business for a valid key', async () => {
      const business: any = { id: 3, apiKey: 'pk_abc' };
      businessRepo.findOne.mockResolvedValue(business);
      const result = await service.findByApiKey('pk_abc');
      expect(result).toBe(business);
      expect(businessRepo.findOne).toHaveBeenCalledWith({ where: { apiKey: 'pk_abc' } });
    });

    it('returns null for a blank key without hitting the repo', async () => {
      expect(await service.findByApiKey('')).toBeNull();
      expect(businessRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
