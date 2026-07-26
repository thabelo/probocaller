import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Business } from './business.entity';
import { normaliseCountryCode } from '../common/countries';
import { normalisePhoneNumber } from '../common/phone';
import { BusinessNumber, NUMBER_PURPOSES } from './business-number.entity';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';

/**
 * The Probocaller-branded placeholder logo every business gets when its owner
 * doesn't supply one — so a business always has an image to show. Served as a
 * static asset by the app front-ends.
 */
export const DEFAULT_BUSINESS_LOGO_URL = '/probocaller-logo.svg';

/** Hard ceiling per money move — anything above this is a typo or an attack. */
const MAX_MONEY_MOVE = 1_000_000;

/**
 * Validate a wallet amount for REAL money movement: a finite, positive number
 * within sane bounds, normalised to the ledger's 4dp. Rejects NaN/Infinity
 * (which pass a naive `> 0` check) and magnitudes that would overflow the
 * numeric(12,4) columns into 500s.
 */
function assertMoneyAmount(amount: number): number {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) {
    throw new BadRequestException('Amount must be a positive number');
  }
  if (a > MAX_MONEY_MOVE) {
    throw new BadRequestException(`Amount exceeds the per-transaction limit of ${MAX_MONEY_MOVE}`);
  }
  return parseFloat(a.toFixed(4));
}


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
    private readonly transactionService: TransactionService,
    private readonly dataSource: DataSource,
  ) {}

  /** Load a business the caller owns, or throw. */
  private async ownedBusinessOrThrow(businessId: number, requesterUserId: number): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.userId !== requesterUserId) {
      throw new ForbiddenException('You do not own this business');
    }
    return business;
  }

  /**
   * Each business has its OWN wallet (Business.walletBalance) — separate from
   * the owner's personal balance. Returns the live balance + the ledger of
   * transactions stamped with this businessId.
   */
  async getWallet(businessId: number, requesterUserId: number) {
    const business = await this.ownedBusinessOrThrow(businessId, requesterUserId);
    const transactions = await this.transactionService.findByBusiness(business.id);
    return {
      businessId: business.id,
      companyName: business.companyName,
      balance: Number(business.walletBalance ?? 0),
      transactions,
    };
  }

  /** Add funds to the BUSINESS wallet (atomic credit + business-scoped audit row). */
  async topUpWallet(businessId: number, requesterUserId: number, amount: number) {
    amount = assertMoneyAmount(amount);
    const business = await this.ownedBusinessOrThrow(businessId, requesterUserId);

    return this.dataSource.transaction(async (manager) => {
      const biz = await manager.findOne(Business, {
        where: { id: business.id },
        lock: { mode: 'pessimistic_write' },
        // Business eagerly joins its numbers; FOR UPDATE can't lock across that
        // LEFT JOIN (Postgres), so read the bare row.
        loadEagerRelations: false,
      });
      if (!biz) throw new NotFoundException('Business not found');
      const next = parseFloat((Number(biz.walletBalance) + Number(amount)).toFixed(4));
      biz.walletBalance = next as any;
      await manager.save(Business, biz);
      await this.transactionService.log(
        business.userId,
        'CREDIT_ADDED',
        Number(amount),
        `Wallet top-up — ${business.companyName}`,
        undefined,
        manager,
        business.id,
      );
      return { businessId: business.id, balance: next };
    });
  }

  /**
   * Move money between the owner's personal balance and a business wallet.
   * direction 'in'  = owner → business; 'out' = business → owner. Both rows are
   * locked in one transaction, and each side gets its own ledger entry.
   */
  async transferWallet(
    businessId: number,
    requesterUserId: number,
    amount: number,
    direction: 'in' | 'out',
  ) {
    const amt = assertMoneyAmount(amount);
    const business = await this.ownedBusinessOrThrow(businessId, requesterUserId);

    return this.dataSource.transaction(async (manager) => {
      const owner = await manager.findOne(User, {
        where: { id: business.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const biz = await manager.findOne(Business, {
        where: { id: business.id },
        lock: { mode: 'pessimistic_write' },
        // Business eagerly joins its numbers; FOR UPDATE can't lock across that
        // LEFT JOIN (Postgres), so read the bare row.
        loadEagerRelations: false,
      });
      if (!owner || !biz) throw new NotFoundException('Wallet not found');

      const source = direction === 'in' ? Number(owner.walletBalance) : Number(biz.walletBalance);
      if (source < amt) throw new BadRequestException('Insufficient funds for this transfer');

      const sign = direction === 'in' ? 1 : -1;
      owner.walletBalance = parseFloat((Number(owner.walletBalance) - sign * amt).toFixed(4)) as any;
      biz.walletBalance = parseFloat((Number(biz.walletBalance) + sign * amt).toFixed(4)) as any;
      await manager.save(User, owner);
      await manager.save(Business, biz);

      // Two audit rows: the owner's personal ledger + the business's ledger.
      await this.transactionService.log(
        owner.id,
        direction === 'in' ? 'TRANSFER_TO_BUSINESS' : 'TRANSFER_FROM_BUSINESS',
        -sign * amt,
        `${direction === 'in' ? 'Transfer to' : 'Transfer from'} ${business.companyName}`,
        undefined,
        manager,
      );
      await this.transactionService.log(
        owner.id,
        direction === 'in' ? 'TRANSFER_FROM_OWNER' : 'TRANSFER_TO_OWNER',
        sign * amt,
        `${direction === 'in' ? 'Funded from' : 'Withdrawn to'} owner balance`,
        undefined,
        manager,
        business.id,
      );

      return {
        businessId: business.id,
        balance: Number(biz.walletBalance),
        ownerBalance: Number(owner.walletBalance),
      };
    });
  }

  getPurposes() {
    return Object.entries(NUMBER_PURPOSES).map(([value, label]) => ({ value, label }));
  }

  async register(userId: number, data: {
    companyName: string;
    industry: string;
    country: string;
    registrationNumber?: string;
    website?: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    logoUrl?: string;
  }): Promise<Business> {
    // The country decides which KYB requirements the business must satisfy, so
    // it has to be a real jurisdiction and is captured at registration time.
    const country = normaliseCountryCode(data.country);
    if (!country) {
      throw new BadRequestException(
        data.country
          ? `"${data.country}" is not a valid ISO 3166-1 alpha-2 country code.`
          : 'A country is required to register a business.',
      );
    }

    // Every business shows an image; fall back to the Probocaller logo.
    const logoUrl = (data.logoUrl ?? '').trim() || DEFAULT_BUSINESS_LOGO_URL;

    const profile = this.businessRepo.create({ ...data, country, logoUrl, userId });
    const saved = await this.businessRepo.save(profile);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      user.isBusiness = true;
      // Registering a company implies (and supersedes) the free opt-in, so the
      // owner never gets re-gated behind the business intro they've passed.
      user.businessOptIn = true;
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

    // Numbers are stored in canonical E.164. A bare national number could be from
    // anywhere, so we ask for the country code rather than guess.
    const phoneNumber = normalisePhoneNumber(data.phoneNumber);
    if (!phoneNumber) {
      throw new BadRequestException(
        `"${data.phoneNumber}" needs a country code — enter it in international format, e.g. +27 11 000 1111.`,
      );
    }

    const existing = await this.numberRepo.findOne({ where: { phoneNumber } });
    if (existing) throw new ConflictException(`${phoneNumber} is already registered to a business`);

    const num = this.numberRepo.create({ ...data, phoneNumber, businessId: profile.id });
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
    businessId: number;
    businessProfile?: { companyName: string; industry: string; description?: string; verified: boolean };
    numberPurpose?: string;
    numberPurposeLabel?: string;
    numberLabel?: string;
  } | null> {
    let num = await this.numberRepo.findOne({
      where: { phoneNumber, active: true },
      relations: ['business'],
    });
    // Incoming-call lookups arrive as the caller's LAST 10 DIGITS (no country
    // code), while calling numbers are stored canonically in E.164 — so an
    // exact match misses real incoming rings. Fall back to a digit-suffix
    // match, but only for full-length (≥10-digit) inputs so short strings can
    // never wildcard onto an unrelated number.
    if (!num) {
      const digits = String(phoneNumber).replace(/\D/g, '');
      if (digits.length >= 10) {
        num = await this.numberRepo.findOne({
          where: { phoneNumber: Like(`%${digits.slice(-10)}`), active: true },
          relations: ['business'],
        });
      }
      // A verified business may have no explicit business_number row and be
      // reachable only on its OWNER's number. Resolve that too, by digit-suffix
      // against the owner user's stored E.164 — otherwise a real business call
      // from the device's last-10 number reads "Unknown" (F7).
      if (!num && digits.length >= 10) {
        const owner = await this.userRepo.findOne({
          where: { phoneNumber: Like(`%${digits.slice(-10)}`), isBusiness: true },
        });
        if (owner) {
          const biz = await this.businessRepo.findOne({ where: { userId: owner.id, active: true } });
          if (biz) {
            return {
              isBusiness: true,
              businessId: biz.id,
              businessProfile: {
                companyName: biz.companyName,
                industry: biz.industry,
                description: biz.description,
                verified: biz.verified,
              },
            };
          }
        }
      }
    }
    if (!num || !num.business?.active) return null;

    const b = num.business;
    return {
      isBusiness: true,
      businessId: b.id,
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

  /**
   * Wallet balance of the business's OWNER user — the wallet completeCall
   * actually debits for a business call. The caller-ID lookup's funds flag must
   * inspect this, not the placeholder user auto-created for a raw calling
   * number (whose balance is always 0 and would wrongly auto-reject the ring).
   */
  async getOwnerWalletBalance(businessId: number | null): Promise<number | null> {
    if (!businessId) return null;
    const b = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!b) return null;
    const owner = await this.userRepo.findOne({ where: { id: b.userId } });
    return owner ? Number(owner.walletBalance) : null;
  }

  async getProfileByUserId(userId: number): Promise<{ id: number; companyName: string; industry: string; description?: string; verified: boolean } | null> {
    // Caller-ID fallback when the calling number isn't registered to any business.
    // Returns the user's most recently created active profile.
    const b = await this.businessRepo.findOne({
      where: { userId, active: true },
      order: { createdAt: 'DESC' },
    });
    if (!b) return null;
    return { id: b.id, companyName: b.companyName, industry: b.industry, description: b.description, verified: b.verified };
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
    country: string;
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
    opts: { label?: string; scopes?: string[]; maxSpendPerCall?: number | null },
  ): Promise<ApiKey> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    // Only a finite positive cap is meaningful; anything else = uncapped (null).
    const cap = Number(opts.maxSpendPerCall);
    const maxSpendPerCall = Number.isFinite(cap) && cap > 0 ? parseFloat(cap.toFixed(4)) : null;
    const key = this.apiKeyRepo.create({
      businessId,
      key: 'pk_' + randomBytes(24).toString('hex'),
      label: opts.label ?? null,
      scopes: opts.scopes ?? [],
      maxSpendPerCall,
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

  /** Business self-service: only the keys of businesses the user owns, newest first. */
  async listApiKeysForUser(userId: number): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { business: { userId } },
      relations: ['business'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Business self-service: create a scoped key for a business the user owns.
   * Mirrors the /leads guard — keys can only be minted for KYB-verified businesses.
   */
  async createApiKeyForUser(
    userId: number,
    businessId: number,
    opts: { label?: string; scopes?: string[]; maxSpendPerCall?: number | null },
  ): Promise<ApiKey> {
    const business = await this.businessRepo.findOne({ where: { id: businessId, userId } });
    if (!business) throw new NotFoundException('Business not found or does not belong to your account.');
    if (!business.verified) throw new ForbiddenException('API access requires KYB verification');
    return this.createApiKey(businessId, opts);
  }

  /** Business self-service: revoke a key, but only if it belongs to the user's own business. */
  async revokeApiKeyForUser(userId: number, keyId: number): Promise<ApiKey> {
    const key = await this.apiKeyRepo.findOne({ where: { id: keyId }, relations: ['business'] });
    if (!key) throw new NotFoundException('API key not found');
    if (!key.business || key.business.userId !== userId) {
      throw new ForbiddenException('This API key does not belong to your account.');
    }
    key.revoked = true;
    return this.apiKeyRepo.save(key);
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
