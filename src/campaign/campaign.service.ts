import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Campaign, CAMPAIGN_STATUSES, CAMPAIGN_TYPES, CAMPAIGN_CHANNELS,
  CampaignStatus, CampaignType, CampaignChannel, SurveyQuestion,
} from './campaign.entity';
import { Business } from '../business/business.entity';
import { BusinessNumber } from '../business/business-number.entity';

export interface CampaignInput {
  name: string;
  type?: CampaignType;
  channel?: CampaignChannel;
  creative?: string | null;
  ctaUrl?: string | null;
  questions?: SurveyQuestion[] | null;
  filters?: Record<string, { op: string; value: any }>;
  audienceId?: number | null;
  callingNumberId?: number | null;
  budget?: number | string;
  status?: CampaignStatus;
}

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessNumber) private readonly numberRepo: Repository<BusinessNumber>,
  ) {}

  /** The business, or throw — scoping every operation to what the caller owns. */
  private async ownedBusiness(userId: number, businessId: number): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id: businessId, userId } });
    if (!business) throw new NotFoundException('Business not found or does not belong to your account.');
    return business;
  }

  private async ownedCampaign(userId: number, id: number): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id }, relations: ['business'] });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.business || campaign.business.userId !== userId) {
      throw new ForbiddenException('This campaign does not belong to your account.');
    }
    return campaign;
  }

  /** A calling number must be one of this business's own numbers. */
  private async assertCallingNumber(businessId: number, callingNumberId?: number | null): Promise<void> {
    if (callingNumberId == null) return;
    const number = await this.numberRepo.findOne({ where: { id: callingNumberId, businessId } });
    if (!number) throw new BadRequestException('That calling number does not belong to this business.');
  }

  async list(userId: number, businessId: number): Promise<Campaign[]> {
    await this.ownedBusiness(userId, businessId);
    return this.campaignRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async create(userId: number, businessId: number, input: CampaignInput): Promise<Campaign> {
    await this.ownedBusiness(userId, businessId);

    const name = (input?.name ?? '').trim();
    if (!name) throw new BadRequestException('A campaign name is required.');

    const type = input.type ?? 'ad';
    if (!CAMPAIGN_TYPES.includes(type)) {
      throw new BadRequestException(`Campaign type must be one of: ${CAMPAIGN_TYPES.join(', ')}.`);
    }
    const channel = input.channel ?? 'in_app';
    if (!CAMPAIGN_CHANNELS.includes(channel)) {
      throw new BadRequestException(`Delivery channel must be one of: ${CAMPAIGN_CHANNELS.join(', ')}.`);
    }
    await this.assertCallingNumber(businessId, input.callingNumberId);

    const campaign = this.campaignRepo.create({
      businessId,
      name,
      type,
      channel,
      creative: input.creative ?? null,
      ctaUrl: input.ctaUrl ?? null,
      questions: input.questions ?? null,
      filters: input.filters ?? {},
      audienceId: input.audienceId ?? null,
      callingNumberId: input.callingNumberId ?? null,
      budget: String(input.budget ?? 0),
      status: 'draft',
    });
    return this.campaignRepo.save(campaign);
  }

  async update(userId: number, id: number, input: Partial<CampaignInput>): Promise<Campaign> {
    const campaign = await this.ownedCampaign(userId, id);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('A campaign name is required.');
      campaign.name = name;
    }
    if (input.type !== undefined) {
      if (!CAMPAIGN_TYPES.includes(input.type)) {
        throw new BadRequestException(`Campaign type must be one of: ${CAMPAIGN_TYPES.join(', ')}.`);
      }
      campaign.type = input.type;
    }
    if (input.channel !== undefined) {
      if (!CAMPAIGN_CHANNELS.includes(input.channel)) {
        throw new BadRequestException(`Delivery channel must be one of: ${CAMPAIGN_CHANNELS.join(', ')}.`);
      }
      campaign.channel = input.channel;
    }
    if (input.creative !== undefined) campaign.creative = input.creative;
    if (input.ctaUrl !== undefined) campaign.ctaUrl = input.ctaUrl;
    if (input.questions !== undefined) campaign.questions = input.questions;
    if (input.filters !== undefined) campaign.filters = input.filters;
    if (input.audienceId !== undefined) campaign.audienceId = input.audienceId;
    if (input.budget !== undefined) campaign.budget = String(input.budget);

    if (input.callingNumberId !== undefined) {
      await this.assertCallingNumber(campaign.businessId, input.callingNumberId);
      campaign.callingNumberId = input.callingNumberId;
    }

    if (input.status !== undefined) {
      if (!CAMPAIGN_STATUSES.includes(input.status)) {
        throw new BadRequestException(`Status must be one of: ${CAMPAIGN_STATUSES.join(', ')}.`);
      }
      if (input.status === 'active') this.assertReadyToActivate(campaign);
      campaign.status = input.status;
    }

    return this.campaignRepo.save(campaign);
  }

  /**
   * A campaign can only go live once it has enough to actually run: a budget,
   * its content (ad creative, or at least one survey question), and — when it's
   * delivered over calls/SMS — a number to send from. Pausing/completing a
   * campaign is always allowed.
   */
  private assertReadyToActivate(campaign: Campaign): void {
    if (!(Number(campaign.budget) > 0)) {
      throw new BadRequestException('Set a budget above zero before activating this campaign.');
    }
    if (campaign.channel === 'calls_sms' && campaign.callingNumberId == null) {
      throw new BadRequestException('Add a calling number before activating this calls/SMS campaign.');
    }
    if (campaign.type === 'ad' && !(campaign.creative ?? '').trim()) {
      throw new BadRequestException('Add ad creative before activating this campaign.');
    }
    if (campaign.type === 'survey' && !(campaign.questions?.length)) {
      throw new BadRequestException('Add at least one survey question before activating this campaign.');
    }
  }

  async remove(userId: number, id: number): Promise<void> {
    const campaign = await this.ownedCampaign(userId, id);
    await this.campaignRepo.remove(campaign);
  }
}
