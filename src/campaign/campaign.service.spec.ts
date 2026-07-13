import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { Campaign } from './campaign.entity';
import { Business } from '../business/business.entity';
import { BusinessNumber } from '../business/business-number.entity';

const mockRepo = () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() });

describe('CampaignService', () => {
  let service: CampaignService;
  let campaignRepo: ReturnType<typeof mockRepo>;
  let businessRepo: ReturnType<typeof mockRepo>;
  let numberRepo: ReturnType<typeof mockRepo>;

  const OWNER = 7;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: getRepositoryToken(Campaign), useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: getRepositoryToken(BusinessNumber), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get(CampaignService);
    campaignRepo = module.get(getRepositoryToken(Campaign));
    businessRepo = module.get(getRepositoryToken(Business));
    numberRepo = module.get(getRepositoryToken(BusinessNumber));

    campaignRepo.create.mockImplementation((x: any) => x);
    campaignRepo.save.mockImplementation(async (x: any) => ({ id: 1, ...x }));
    businessRepo.findOne.mockResolvedValue({ id: 3, userId: OWNER });
  });

  describe('list', () => {
    it("returns only the given business's campaigns, newest first", async () => {
      campaignRepo.find.mockResolvedValue([{ id: 1 }]);
      await service.list(OWNER, 3);
      expect(campaignRepo.find).toHaveBeenCalledWith({
        where: { businessId: 3 },
        order: { createdAt: 'DESC' },
      });
    });

    it('refuses a business the caller does not own', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.list(OWNER, 999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a draft campaign for an owned business', async () => {
      const res = await service.create(OWNER, 3, { name: 'Q3 push', filters: { age_range: { op: 'eq', value: '25_34' } } });
      expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        businessId: 3, name: 'Q3 push', status: 'draft',
      }));
      expect(res.id).toBe(1);
    });

    it('requires a name', async () => {
      await expect(service.create(OWNER, 3, { name: '  ' } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(campaignRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a business the caller does not own', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.create(OWNER, 999, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a calling number belonging to another business", async () => {
      numberRepo.findOne.mockResolvedValue(null);
      await expect(service.create(OWNER, 3, { name: 'X', callingNumberId: 42 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a calling number that belongs to the business', async () => {
      numberRepo.findOne.mockResolvedValue({ id: 42, businessId: 3 });
      await service.create(OWNER, 3, { name: 'X', callingNumberId: 42 });
      expect(numberRepo.findOne).toHaveBeenCalledWith({ where: { id: 42, businessId: 3 } });
    });

    it('defaults a new campaign to an in-app ad', async () => {
      await service.create(OWNER, 3, { name: 'X' });
      expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'ad', channel: 'in_app' }));
    });

    it('stores ad creative and CTA', async () => {
      await service.create(OWNER, 3, { name: 'Promo', type: 'ad', creative: 'Half price today', ctaUrl: 'https://x.co/deal' });
      expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ad', creative: 'Half price today', ctaUrl: 'https://x.co/deal',
      }));
    });

    it('stores survey questions', async () => {
      await service.create(OWNER, 3, { name: 'CSAT', type: 'survey', channel: 'calls_sms', questions: [{ text: 'Rate us 1-5' }] });
      expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'survey', channel: 'calls_sms', questions: [{ text: 'Rate us 1-5' }],
      }));
    });

    it('rejects an unknown campaign type', async () => {
      await expect(service.create(OWNER, 3, { name: 'X', type: 'webinar' as any })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown delivery channel', async () => {
      await expect(service.create(OWNER, 3, { name: 'X', channel: 'email' as any })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    // A ready-to-run in-app ad by default: has creative and budget, no number needed.
    const owned = () => ({
      id: 1, businessId: 3, name: 'X', type: 'ad', channel: 'in_app',
      creative: 'Buy now', ctaUrl: null, questions: null,
      status: 'draft', budget: '100.0000', callingNumberId: null,
      business: { id: 3, userId: OWNER },
    });

    it('updates a campaign the caller owns', async () => {
      campaignRepo.findOne.mockResolvedValue(owned());
      campaignRepo.save.mockImplementation(async (x: any) => x);
      const res = await service.update(OWNER, 1, { name: 'Renamed' });
      expect(res.name).toBe('Renamed');
    });

    it("refuses a campaign belonging to someone else's business", async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), business: { id: 3, userId: 999 } });
      await expect(service.update(OWNER, 1, { name: 'Nope' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unknown status', async () => {
      campaignRepo.findOne.mockResolvedValue(owned());
      await expect(service.update(OWNER, 1, { status: 'launched' as any })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('will not activate a calls/SMS campaign with no calling number', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), channel: 'calls_sms', callingNumberId: null });
      await expect(service.update(OWNER, 1, { status: 'active' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does NOT require a calling number for an in-app campaign', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), channel: 'in_app', callingNumberId: null });
      campaignRepo.save.mockImplementation(async (x: any) => x);
      expect((await service.update(OWNER, 1, { status: 'active' })).status).toBe('active');
    });

    it('will not activate a campaign with no budget', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), budget: '0.0000' });
      await expect(service.update(OWNER, 1, { status: 'active' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('will not activate an ad with no creative', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), type: 'ad', creative: '   ' });
      await expect(service.update(OWNER, 1, { status: 'active' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('will not activate a survey with no questions', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), type: 'survey', creative: null, questions: [] });
      await expect(service.update(OWNER, 1, { status: 'active' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('activates a calls/SMS survey with a number, questions and budget', async () => {
      campaignRepo.findOne.mockResolvedValue({
        ...owned(), type: 'survey', channel: 'calls_sms', creative: null,
        questions: [{ text: 'How did we do?' }], callingNumberId: 42,
      });
      campaignRepo.save.mockImplementation(async (x: any) => x);
      const res = await service.update(OWNER, 1, { status: 'active' });
      expect(res.status).toBe('active');
    });

    it('always allows pausing an active campaign', async () => {
      campaignRepo.findOne.mockResolvedValue({ ...owned(), status: 'active', budget: '0.0000', creative: null });
      campaignRepo.save.mockImplementation(async (x: any) => x);
      expect((await service.update(OWNER, 1, { status: 'paused' })).status).toBe('paused');
    });
  });

  describe('remove', () => {
    it('removes a campaign the caller owns', async () => {
      const c = { id: 1, business: { userId: OWNER } };
      campaignRepo.findOne.mockResolvedValue(c);
      await service.remove(OWNER, 1);
      expect(campaignRepo.remove).toHaveBeenCalledWith(c);
    });

    it('refuses to remove a campaign the caller does not own', async () => {
      campaignRepo.findOne.mockResolvedValue({ id: 1, business: { userId: 999 } });
      await expect(service.remove(OWNER, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(campaignRepo.remove).not.toHaveBeenCalled();
    });

    it('404s for an unknown campaign', async () => {
      campaignRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(OWNER, 99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
