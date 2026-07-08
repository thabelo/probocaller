import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Business } from './business.entity';
import { BusinessNumber, NUMBER_PURPOSES } from './business-number.entity';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(BusinessNumber)
    private numberRepo: Repository<BusinessNumber>,
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  getPurposes() {
    return Object.entries(NUMBER_PURPOSES).map(([value, label]) => ({ value, label }));
  }

  async register(userId: number, data: {
    companyName: string;
    industry: string;
    registrationNumber?: string;
    website?: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
  }): Promise<Business> {
    const profile = this.businessRepo.create({ ...data, userId });
    const saved = await this.businessRepo.save(profile);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      user.isBusiness = true;
      await this.userRepo.save(user);
    }

    return this.businessRepo.findOne({ where: { id: saved.id }, relations: ['numbers'] });
  }

  async getMyProfile(userId: number): Promise<Business> {
    const profile = await this.businessRepo.findOne({
      where: { userId },
      relations: ['numbers'],
      order: { createdAt: 'DESC' },
    });
    if (!profile) throw new NotFoundException('No business profile found. Register first.');
    return profile;
  }

  async getMyProfiles(userId: number): Promise<Business[]> {
    return this.businessRepo.find({
      where: { userId },
      relations: ['numbers'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateProfile(userId: number, businessId: number, data: Partial<Business>): Promise<Business> {
    const profile = await this.businessRepo.findOne({ where: { id: businessId, userId } });
    if (!profile) throw new NotFoundException('Business profile not found or does not belong to your account.');
    const { id, userId: _uid, user, numbers, createdAt, updatedAt, verified, ...safe } = data as any;
    Object.assign(profile, safe);
    await this.businessRepo.save(profile);
    return this.businessRepo.findOne({ where: { id: businessId }, relations: ['numbers'] });
  }

  async addNumber(userId: number, data: {
    businessId: number;
    phoneNumber: string;
    purpose: string;
    label?: string;
  }): Promise<BusinessNumber> {
    const profile = await this.businessRepo.findOne({ where: { id: data.businessId, userId } });
    if (!profile) throw new NotFoundException('Business profile not found or does not belong to your account.');

    const existing = await this.numberRepo.findOne({ where: { phoneNumber: data.phoneNumber } });
    if (existing) throw new ConflictException(`${data.phoneNumber} is already registered to a business`);

    const num = this.numberRepo.create({ ...data, businessId: profile.id });
    return this.numberRepo.save(num);
  }

  async getNumbers(userId: number, businessId: number): Promise<BusinessNumber[]> {
    const profile = await this.businessRepo.findOne({ where: { id: businessId, userId } });
    if (!profile) throw new NotFoundException('Business profile not found or does not belong to your account.');
    return this.numberRepo.find({ where: { businessId: profile.id }, order: { createdAt: 'DESC' } });
  }

  async updateNumber(userId: number, numberId: number, data: {
    purpose?: string;
    label?: string;
    active?: boolean;
  }): Promise<BusinessNumber> {
    const num = await this.numberRepo.findOne({ where: { id: numberId }, relations: ['business'] });
    if (!num || num.business?.userId !== userId) throw new NotFoundException('Number not found');

    Object.assign(num, data);
    return this.numberRepo.save(num);
  }

  async deleteNumber(userId: number, numberId: number): Promise<void> {
    const num = await this.numberRepo.findOne({ where: { id: numberId }, relations: ['business'] });
    if (!num || num.business?.userId !== userId) throw new NotFoundException('Number not found');
    await this.numberRepo.remove(num);
  }

  async resolveCallerIdentity(phoneNumber: string): Promise<{
    isBusiness: boolean;
    businessProfile?: { companyName: string; industry: string; description?: string; verified: boolean };
    numberPurpose?: string;
    numberPurposeLabel?: string;
    numberLabel?: string;
  } | null> {
    const num = await this.numberRepo.findOne({
      where: { phoneNumber, active: true },
      relations: ['business'],
    });
    if (!num || !num.business?.active) return null;

    const b = num.business;
    return {
      isBusiness: true,
      businessProfile: {
        companyName: b.companyName,
        industry: b.industry,
        description: b.description,
        verified: b.verified,
      },
      numberPurpose: num.purpose,
      numberPurposeLabel: NUMBER_PURPOSES[num.purpose as keyof typeof NUMBER_PURPOSES] || num.purpose,
      numberLabel: num.label,
    };
  }

  async getProfileByUserId(userId: number): Promise<{ companyName: string; industry: string; description?: string; verified: boolean } | null> {
    // Caller-ID fallback when the calling number isn't registered to any business.
    // Returns the user's most recently created active profile.
    const b = await this.businessRepo.findOne({
      where: { userId, active: true },
      order: { createdAt: 'DESC' },
    });
    if (!b) return null;
    return { companyName: b.companyName, industry: b.industry, description: b.description, verified: b.verified };
  }

  async adminAddNumber(businessId: number, data: {
    phoneNumber: string;
    purpose: string;
    label?: string;
  }): Promise<BusinessNumber> {
    const profile = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!profile) throw new NotFoundException('Business profile not found');

    const existing = await this.numberRepo.findOne({ where: { phoneNumber: data.phoneNumber } });
    if (existing) throw new ConflictException(`${data.phoneNumber} is already registered to a business`);

    const num = this.numberRepo.create({ ...data, businessId: profile.id });
    return this.numberRepo.save(num);
  }

  async adminRegisterBusiness(userId: number, data: {
    companyName: string;
    industry: string;
    description?: string;
    contactPhone?: string;
    contactEmail?: string;
    website?: string;
    registrationNumber?: string;
    address?: string;
  }): Promise<Business> {
    return this.register(userId, data);
  }

  async getAllProfiles(): Promise<Business[]> {
    return this.businessRepo.find({ relations: ['numbers', 'user'], order: { createdAt: 'DESC' } });
  }

  async verifyProfile(profileId: number, verified: boolean): Promise<Business> {
    const profile = await this.businessRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Business profile not found');
    profile.verified = verified;
    return this.businessRepo.save(profile);
  }

  async adminUpdateProfile(profileId: number, data: Partial<Business>): Promise<Business> {
    const profile = await this.businessRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Business profile not found');
    const { id, userId, user, numbers, createdAt, updatedAt, ...safe } = data as any;
    Object.assign(profile, safe);
    return this.businessRepo.save(profile);
  }

  async adminDeleteNumber(numberId: number): Promise<void> {
    const num = await this.numberRepo.findOne({ where: { id: numberId } });
    if (!num) throw new NotFoundException('Number not found');
    await this.numberRepo.remove(num);
  }

  // ─── API keys (businesses call the /leads API with these) ───────────────────

  /** Create a new API key for a business, scoped to specific profile fields. */
  async createApiKey(
    businessId: number,
    opts: { label?: string; scopes?: string[] },
  ): Promise<ApiKey> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    const key = this.apiKeyRepo.create({
      businessId,
      key: 'pk_' + randomBytes(24).toString('hex'),
      label: opts.label ?? null,
      scopes: opts.scopes ?? [],
      revoked: false,
    });
    return this.apiKeyRepo.save(key);
  }

  /** Resolve an active API key (with its business); null for blank/unknown. */
  async findActiveApiKey(key: string): Promise<ApiKey | null> {
    if (!key) return null;
    return this.apiKeyRepo.findOne({ where: { key, revoked: false }, relations: ['business'] });
  }

  /** Admin: every API key with its owning business, newest first. */
  async adminListApiKeys(): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({ relations: ['business'], order: { createdAt: 'DESC' } });
  }

  /** Revoke an API key (it stops authenticating immediately). */
  async revokeApiKey(id: number): Promise<ApiKey> {
    const key = await this.apiKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    key.revoked = true;
    return this.apiKeyRepo.save(key);
  }

  /** Record a billed /leads call against a key (call count + spend + last used). */
  async recordApiKeyUsage(apiKeyId: number, spend: number): Promise<void> {
    await this.apiKeyRepo.increment({ id: apiKeyId }, 'callCount', 1);
    if (spend > 0) await this.apiKeyRepo.increment({ id: apiKeyId }, 'totalSpend', spend);
    await this.apiKeyRepo.update(apiKeyId, { lastUsedAt: new Date() });
  }
}
