import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProfileField } from './profile-field.entity';
import { UserProfile } from './user-profile.entity';
import { DataAccessLog } from './data-access-log.entity';
import { BusinessAudience } from './business-audience.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Transaction } from '../transaction/transaction.entity';
import { DataCertificate } from './data-certificate.entity';
import { randomBytes } from 'crypto';

// A data-usage certificate costs a fixed base fee plus the cost of the leads it
// generates. Buying leads always mints a new certificate; the leads on an issued
// certificate are frozen.
const CERTIFICATE_BASE_FEE = 250;
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertProfileFieldDto } from './dto/upsert-profile-field.dto';
import { QueryAudienceDto, SaveAudienceDto } from './dto/query-audience.dto';
import { AdminUpdateDataBrokerDto } from './dto/admin-data-broker.dto';
import { ReferralService } from '../referral/referral.service';

const TIER_THRESHOLDS = { basic: 0, silver: 25, gold: 50, platinum: 75 };

function tierFromScore(score: number): string {
  if (score >= 75) return 'platinum';
  if (score >= 50) return 'gold';
  if (score >= 25) return 'silver';
  return 'basic';
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(ProfileField)
    private fieldRepo: Repository<ProfileField>,
    @InjectRepository(UserProfile)
    private profileRepo: Repository<UserProfile>,
    @InjectRepository(DataAccessLog)
    private accessLogRepo: Repository<DataAccessLog>,
    @InjectRepository(BusinessAudience)
    private audienceRepo: Repository<BusinessAudience>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
    @InjectRepository(DataCertificate)
    private certRepo: Repository<DataCertificate>,
    private readonly referralService: ReferralService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Profile fields (public + admin) ─────────────────────────────────────

  async getEnabledFields(): Promise<ProfileField[]> {
    return this.fieldRepo.find({ where: { enabled: true }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async adminGetAllFields(): Promise<ProfileField[]> {
    return this.fieldRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async adminUpsertField(dto: UpsertProfileFieldDto): Promise<ProfileField> {
    let field = await this.fieldRepo.findOne({ where: { key: dto.key } });
    if (!field) field = this.fieldRepo.create({ key: dto.key });
    if (dto.label !== undefined) field.label = dto.label;
    if (dto.type !== undefined) field.type = dto.type;
    if (dto.options !== undefined) field.options = dto.options;
    if (dto.weight !== undefined) field.weight = dto.weight;
    if (dto.creditCost !== undefined) field.creditCost = dto.creditCost;
    if (dto.enabled !== undefined) field.enabled = dto.enabled;
    if (dto.sortOrder !== undefined) field.sortOrder = dto.sortOrder;
    return this.fieldRepo.save(field);
  }

  async adminDeleteField(id: number): Promise<void> {
    await this.fieldRepo.delete(id);
  }

  // ─── User profile ─────────────────────────────────────────────────────────

  async getOrCreateProfile(userId: number): Promise<UserProfile> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profileRepo.create({ userId, data: {}, verifiedFields: {}, floorPrices: {} });
      profile = await this.profileRepo.save(profile);
    }
    return profile;
  }

  async getMyProfile(userId: number) {
    const [profile, fields] = await Promise.all([
      this.getOrCreateProfile(userId),
      this.getEnabledFields(),
    ]);
    const totalWeight = fields.reduce((s, f) => s + Number(f.weight), 0) || 1;
    const filledWeight = fields
      .filter((f) => profile.data[f.key] !== undefined && profile.data[f.key] !== null && profile.data[f.key] !== '')
      .reduce((s, f) => s + Number(f.weight), 0);
    const score = parseFloat(((filledWeight / totalWeight) * 100).toFixed(2));
    const tier = tierFromScore(score);

    if (profile.completionScore !== score || profile.tier !== tier) {
      profile.completionScore = score;
      profile.tier = tier;
      await this.profileRepo.save(profile);
    }

    return { ...profile, completionScore: score, tier, fields };
  }

  private static isFilled(data: Record<string, any>, key: string): boolean {
    const v = data?.[key];
    return v !== undefined && v !== null && v !== '';
  }

  /**
   * The enabled profile fields the user has actually filled in — the candidate
   * set for data sharing under the "share all filled fields" model. Turning data
   * sharing on selects exactly these.
   */
  async sharableCandidateKeys(userId: number): Promise<string[]> {
    const [profile, fields] = await Promise.all([
      this.profileRepo.findOne({ where: { userId } }),
      this.getEnabledFields(),
    ]);
    const data = profile?.data || {};
    return fields.map((f) => f.key).filter((k) => ProfileService.isFilled(data, k));
  }

  async updateMyProfile(userId: number, dto: UpdateProfileDto) {
    const profile = await this.getOrCreateProfile(userId);
    const oldData = profile.data || {};
    if (dto.data !== undefined) profile.data = { ...dto.data };
    if (dto.floorPrices !== undefined) profile.floorPrices = { ...profile.floorPrices, ...dto.floorPrices };
    await this.profileRepo.save(profile);

    // "Share all filled fields": while sharing is on, a field that just went
    // empty→filled opts into sharing automatically. Only NEWLY-filled fields are
    // added, so a field the user explicitly deselected (but already had a value)
    // is never silently re-shared.
    if (dto.data !== undefined) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user?.dataShareEnabled) {
        const fields = await this.getEnabledFields();
        const newlyFilled = fields
          .map((f) => f.key)
          .filter((k) => ProfileService.isFilled(profile.data, k) && !ProfileService.isFilled(oldData, k));
        if (newlyFilled.length) {
          const cats = new Set(user.dataCategories || []);
          newlyFilled.forEach((k) => cats.add(k));
          user.dataCategories = [...cats];
          await this.userRepo.save(user);
        }
      }
    }
    return this.getMyProfile(userId);
  }

  /**
   * The leads a business has ACQUIRED via the /leads API — de-duplicated per
   * user (union of fields bought, total spent, latest purchase), each flagged
   * `callable` using the same gate as the call flow (businessCallPolicy !==
   * 'blocked'). This is "the leads a business is allowed to call".
   */
  async getBusinessLeads(businessUserId: number, businessId?: number) {
    // Scope to a specific owned business when one is given (leads are per business),
    // else fall back to the caller's business.
    const where = businessId ? { id: businessId, userId: businessUserId } : { userId: businessUserId };
    const business = await this.businessRepo.findOne({ where });
    if (!business) throw new ForbiddenException('Business profile required');

    // Leads are viewable only while the business holds a data certificate — the
    // record of its authorisation to use those numbers.
    const certCount = await this.certRepo.count({ where: { businessId: business.id } });
    if (certCount === 0) {
      throw new ForbiddenException('A data certificate is required to view leads. Purchase audience data to be issued one.');
    }

    return this.buildLeadEntries(business.id);
  }

  // A lead set = one certificate. Selecting it lists exactly the users it froze
  // (cert.userIds), with the same lead detail as the full leads view.
  async getCertificateLeads(businessUserId: number, code: string, businessId?: number) {
    const where = businessId ? { id: businessId, userId: businessUserId } : { userId: businessUserId };
    const business = await this.businessRepo.findOne({ where });
    if (!business) throw new ForbiddenException('Business profile required');

    const cert = await this.certRepo.findOne({ where: { code, businessId: business.id } });
    if (!cert) throw new NotFoundException('Certificate not found');

    return this.buildLeadEntries(business.id, new Set(cert.userIds || []));
  }

  // Deduped per-user lead entries from the business's access logs. When
  // `userIds` is given, restrict to that frozen set (one certificate's people).
  private async buildLeadEntries(businessId: number, userIds?: Set<number>) {
    const logs = await this.accessLogRepo.find({
      where: { businessId },
      relations: ['user'],
      order: { accessedAt: 'DESC' },
    });

    const byUser = new Map<number, any>();
    for (const log of logs) {
      const u: any = (log as any).user;
      if (!u) continue;
      if (userIds && !userIds.has(u.id)) continue;
      let entry = byUser.get(u.id);
      if (!entry) {
        const policy = u.businessCallPolicy || 'paid';
        entry = {
          userId: u.id,
          name: u.name,
          phone: u.phoneNumber,
          fields: new Set<string>(),
          totalSpent: 0,
          lastPurchasedAt: log.accessedAt, // logs are DESC → first seen is latest
          callPolicy: policy,
          callable: policy !== 'blocked',
        };
        byUser.set(u.id, entry);
      }
      (log.fieldsAccessed || []).forEach((f) => entry.fields.add(f));
      entry.totalSpent = parseFloat((entry.totalSpent + Number(log.creditsCost || 0)).toFixed(4));
    }
    return [...byUser.values()].map((e) => ({ ...e, fields: [...e.fields] }));
  }

  // ─── Admin: view & control any user's data profile ──────────────────────────

  async adminGetUserDataProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const profile = await this.getMyProfile(userId);
    return {
      user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name },
      dataShareEnabled: user.dataShareEnabled,
      incognitoEnabled: user.incognitoEnabled,
      dataCategories: user.dataCategories ?? [],
      profile,
    };
  }

  async adminUpdateUserDataBroker(userId: number, dto: AdminUpdateDataBrokerDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (dto.dataShareEnabled !== undefined) user.dataShareEnabled = dto.dataShareEnabled;
    if (dto.incognitoEnabled !== undefined) user.incognitoEnabled = dto.incognitoEnabled;
    if (dto.dataCategories !== undefined) user.dataCategories = dto.dataCategories;
    await this.userRepo.save(user);
    return this.adminGetUserDataProfile(userId);
  }

  // ─── Audience queries (business) ──────────────────────────────────────────

  private async matchingProfiles(
    filters: Record<string, { op: string; value: any }> = {},
    dateRange: { from?: string; to?: string } = {},
  ): Promise<UserProfile[]> {
    const profiles = await this.profileRepo.find();
    const fromTs = dateRange.from ? new Date(dateRange.from).getTime() : null;
    const toTs = dateRange.to ? new Date(dateRange.to).getTime() : null;
    return profiles.filter((p) => {
      if (!p.data || Object.keys(p.data).length === 0) return false;
      // Date-range filter on when the profile data was last updated.
      const updated = p.lastUpdated ? new Date(p.lastUpdated).getTime() : null;
      if (fromTs !== null && (updated === null || updated < fromTs)) return false;
      if (toTs !== null && (updated === null || updated > toTs)) return false;
      return Object.entries(filters).every(([key, { op, value }]) => {
        const v = p.data[key];
        if (v === undefined || v === null) return false;
        switch (op) {
          case 'eq': return String(v) === String(value);
          case 'gte': return Number(v) >= Number(value);
          case 'lte': return Number(v) <= Number(value);
          case 'in': return Array.isArray(value) && value.map(String).includes(String(v));
          default: return false;
        }
      });
    });
  }

  async queryAudience(businessUserId: number, dto: QueryAudienceDto, allowedFields: string[] = []) {
    const business = await this.businessRepo.findOne({
      where: dto.businessId ? { id: dto.businessId, userId: businessUserId } : { userId: businessUserId },
    });
    if (!business) throw new ForbiddenException('Business profile required');
    const fields = await this.getEnabledFields();
    const fieldMap = Object.fromEntries(fields.map((f) => [f.key, f]));
    const matches = await this.matchingProfiles(dto.filters, { from: dto.fromDate, to: dto.toDate });

    // Estimate cost: sum of creditCost for each requested field × matched users.
    // An API key's scopes (allowedFields) cap which fields it may access.
    let requestedKeys = dto.filters ? Object.keys(dto.filters) : fields.map((f) => f.key);
    if (allowedFields.length) requestedKeys = requestedKeys.filter((k) => allowedFields.includes(k));
    const costPerUser = requestedKeys.reduce((s, k) => s + Number(fieldMap[k]?.creditCost || 0), 0);
    const estimatedCost = parseFloat((costPerUser * matches.length).toFixed(4));

    return {
      estimatedReach: matches.length,
      estimatedCostPerUser: parseFloat(costPerUser.toFixed(4)),
      estimatedTotalCost: estimatedCost,
      currency: 'credits',
    };
  }

  async purchaseLeads(businessUserId: number, dto: QueryAudienceDto, allowedFields: string[] = []) {
    // Purchase on behalf of a specific owned business when one is given (leads are
    // per business), else the caller's default business.
    const business = await this.businessRepo.findOne({
      where: dto.businessId ? { id: dto.businessId, userId: businessUserId } : { userId: businessUserId },
    });
    if (!business) throw new ForbiddenException('Business profile required');

    const caller = await this.userRepo.findOne({ where: { id: businessUserId } });
    if (!caller) throw new NotFoundException('Business user not found');

    const fields = await this.getEnabledFields();
    const fieldMap = Object.fromEntries(fields.map((f) => [f.key, f]));
    const matches = await this.matchingProfiles(dto.filters, { from: dto.fromDate, to: dto.toDate });
    if (matches.length === 0) return { purchased: 0, leads: [] as any[], totalCost: 0, totalEarnedByUsers: 0, certificate: undefined as DataCertificate | undefined, certificatePrice: 0 };

    // An API key's scopes (allowedFields) cap which fields it may buy.
    let requestedKeys = dto.filters ? Object.keys(dto.filters) : fields.map((f) => f.key);
    if (allowedFields.length) requestedKeys = requestedKeys.filter((k) => allowedFields.includes(k));
    // H7 bugfix — compute costPerUser EXPLICITLY before the affordability
    // calc. The old expression was
    //     Math.floor(budget / sum || matches.length)
    // which has two bad cases: (a) `budget === 0` made `0 || matches.length`
    // evaluate to `matches.length`, so a budget-zero request bought every
    // matched profile at full price; (b) `sum === 0` produced `Infinity`
    // which `Math.floor` returned as `Infinity`, also buying every match.
    const costPerUser = requestedKeys.reduce((s, k) => s + Number(fieldMap[k]?.creditCost || 0), 0);
    const maxAffordable = dto.budget !== undefined
      ? (costPerUser > 0
          ? Math.min(matches.length, Math.floor(Number(dto.budget) / costPerUser))
          : matches.length /* zero-cost fields are intentional give-aways */)
      : matches.length;

    const toProcess = matches.slice(0, maxAffordable);
    const consentExpiresAt = dto.consentDays
      ? new Date(Date.now() + dto.consentDays * 86400_000)
      : null;

    // H6 bugfix — wrap the wallet-mutating loop in a single transaction with
    // a pessimistic_write lock on the caller's wallet row, so two parallel
    // purchaseLeads calls from the same business can't both read the same
    // starting balance and underpay the platform. Tested via the
    // "Backend H6 — locks the caller wallet row" case in
    // profile.service.spec.ts.
    return this.dataSource.transaction(async (manager) => {
      const lockedCaller = await manager.findOne(User, {
        where: { id: businessUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedCaller) throw new NotFoundException('Business user not found');

      // A purchase mints a certificate, which carries a fixed base fee. A business
      // that can't cover the base fee can't buy leads at all. Reserve it up front
      // so the per-lead loop only spends the remaining balance; refund it if no
      // lead ends up being bought (no certificate is issued for zero leads).
      if (Number(lockedCaller.walletBalance) < CERTIFICATE_BASE_FEE) {
        return { purchased: 0, leads: [] as any[], totalCost: 0, totalEarnedByUsers: 0, certificate: undefined as DataCertificate | undefined, certificatePrice: 0 };
      }
      lockedCaller.walletBalance = parseFloat((Number(lockedCaller.walletBalance) - CERTIFICATE_BASE_FEE).toFixed(6));

      const leads: any[] = [];
      let totalCost = 0;
      let totalEarned = 0;

      for (const profile of toProcess) {
        const user = await manager.findOne(User, { where: { id: profile.userId } });
        if (!user || !user.dataShareEnabled) continue;

        const sharableKeys = requestedKeys.filter((k) => (user.dataCategories || []).includes(k));
        if (sharableKeys.length === 0) continue;

        const costForUser = sharableKeys.reduce((s, k) => {
          const fieldCost = Number(fieldMap[k]?.creditCost || 0);
          const floor = Number(profile.floorPrices?.[k] || 0);
          return s + Math.max(fieldCost, floor);
        }, 0);

        if (Number(lockedCaller.walletBalance) < totalCost + costForUser) break;

        const platformCut = parseFloat((costForUser * 0.24).toFixed(6));
        const userEarning = parseFloat((costForUser - platformCut).toFixed(6));

        lockedCaller.walletBalance = parseFloat((Number(lockedCaller.walletBalance) - costForUser).toFixed(6));
        user.walletBalance = parseFloat((Number(user.walletBalance) + userEarning).toFixed(6));

        // Notify the data owner of the profit (in-app; the app polls
        // /user/notifications and surfaces it via notifee).
        user.notifications = [
          ...(user.notifications || []),
          {
            id: Date.now() + profile.userId,
            message: `You earned R${userEarning.toFixed(2)} — ${business.companyName} accessed your data`,
            timestamp: new Date(),
            read: false,
          },
        ];
        await manager.save(User, user);

        // Incognito (premium): skip attributing this access in the user's
        // "who viewed my data" log. The payment/earning still happens below,
        // so the user is still compensated — only the viewer identity is hidden.
        if (!(lockedCaller as any).incognitoEnabled) {
          await manager.save(DataAccessLog, manager.create(DataAccessLog, {
            userId: profile.userId,
            businessId: business.id,
            fieldsAccessed: sharableKeys,
            purpose: dto.purpose || null,
            creditsCost: costForUser,
            userEarnings: userEarning,
            consentExpiresAt,
          }));
        }

        await manager.save(Transaction, manager.create(Transaction, {
          userId: businessUserId, type: 'DATA_PURCHASE', amount: -costForUser,
          description: `Lead data purchase: ${sharableKeys.join(', ')}`,
        }));
        await manager.save(Transaction, manager.create(Transaction, {
          userId: profile.userId, type: 'DATA_EARN', amount: userEarning,
          description: `Profile data accessed by ${business.companyName}`,
        }));

        // Lifetime referral commission: if this data-owner was referred, pay
        // their referrer an EXTRA 3% on this earning inside the SAME manager/tx.
        await this.referralService.payCommission(profile.userId, userEarning, manager);

        const leadData: Record<string, any> = {};
        for (const k of sharableKeys) leadData[k] = profile.data[k];
        leads.push({ userId: profile.userId, phone: user.phoneNumber, name: user.name, tier: profile.tier, data: leadData });

        totalCost = parseFloat((totalCost + costForUser).toFixed(6));
        totalEarned = parseFloat((totalEarned + userEarning).toFixed(6));
      }

      // Issue a data-usage certificate for this purchase — priced at the base fee
      // plus the leads generated now (frozen). It attests the business was
      // authorised to use those numbers over [now, now + consentDays] (30-day
      // default), and its code can be validated by anyone. Holding a certificate
      // is what unlocks the business's Leads view. If no lead was bought, refund
      // the reserved base fee and issue nothing.
      let certificate: DataCertificate | undefined;
      let certificatePrice = 0;
      if (leads.length > 0) {
        const periodStart = new Date();
        const days = dto.consentDays && dto.consentDays > 0 ? dto.consentDays : 30;
        const periodEnd = new Date(periodStart.getTime() + days * 86400_000);
        certificatePrice = parseFloat((CERTIFICATE_BASE_FEE + totalCost).toFixed(4));
        certificate = await manager.save(DataCertificate, manager.create(DataCertificate, {
          code: ProfileService.generateCertCode(),
          name: (dto.name || '').trim() || `Leads ${new Date().toISOString().slice(0, 10)}`,
          businessId: business.id,
          businessName: business.companyName,
          periodStart,
          periodEnd,
          leadCount: leads.length,
          userIds: leads.map((l) => l.userId),
          purpose: dto.purpose || null,
          basePrice: CERTIFICATE_BASE_FEE,
          leadsCost: totalCost,
          totalPrice: certificatePrice,
        }));
        await manager.save(Transaction, manager.create(Transaction, {
          userId: businessUserId, type: 'CERTIFICATE_FEE', amount: -CERTIFICATE_BASE_FEE,
          description: `Data certificate ${certificate.code} — base fee`,
        }));
      } else {
        // No lead bought → refund the reserved base fee.
        lockedCaller.walletBalance = parseFloat((Number(lockedCaller.walletBalance) + CERTIFICATE_BASE_FEE).toFixed(6));
      }

      await manager.save(User, lockedCaller);

      return { purchased: leads.length, leads, totalCost, totalEarnedByUsers: totalEarned, certificate, certificatePrice };
    });
  }

  // A short, human-shareable certificate code, e.g. 'PC-3F9K-27A1'.
  private static generateCertCode(): string {
    const raw = randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    return `PC-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  }

  /** The certificates a business has been issued (newest first). */
  async getMyCertificates(businessUserId: number, businessId?: number) {
    const where = businessId ? { id: businessId, userId: businessUserId } : { userId: businessUserId };
    const business = await this.businessRepo.findOne({ where });
    if (!business) throw new ForbiddenException('Business profile required');
    return this.certRepo.find({ where: { businessId: business.id }, order: { issuedAt: 'DESC' } });
  }

  /**
   * Validate a certificate by its public code — anyone can confirm a business's
   * authorisation window. `valid` = the certificate exists; `active` = now falls
   * within [periodStart, periodEnd].
   */
  async validateCertificate(code: string) {
    const cert = await this.certRepo.findOne({ where: { code } });
    if (!cert) return { valid: false, active: false, code };
    const now = Date.now();
    const active = now >= new Date(cert.periodStart).getTime() && now <= new Date(cert.periodEnd).getTime();
    return {
      valid: true,
      active,
      code: cert.code,
      businessName: cert.businessName,
      periodStart: cert.periodStart,
      periodEnd: cert.periodEnd,
      leadCount: cert.leadCount,
      totalPrice: cert.totalPrice,
      issuedAt: cert.issuedAt,
    };
  }

  // ─── Aggregate reports (anonymised) ───────────────────────────────────────

  async getAggregateReport(businessUserId: number, filters: Record<string, { op: string; value: any }> = {}) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('Business profile required');

    const matches = await this.matchingProfiles(filters);
    if (matches.length === 0) return { sampleSize: 0, distributions: {} };

    const fields = await this.getEnabledFields();
    const distributions: Record<string, any> = {};

    for (const field of fields) {
      const values = matches.map((p) => p.data[field.key]).filter((v) => v !== undefined && v !== null);
      if (values.length === 0) continue;

      if (field.type === 'select') {
        const counts: Record<string, number> = {};
        for (const v of values) counts[String(v)] = (counts[String(v)] || 0) + 1;
        distributions[field.key] = { type: 'distribution', label: field.label, counts };
      } else if (field.type === 'number') {
        const nums = values.map(Number).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          distributions[field.key] = { type: 'numeric', label: field.label, avg: parseFloat(avg.toFixed(2)), min: Math.min(...nums), max: Math.max(...nums), count: nums.length };
        }
      } else if (field.type === 'boolean') {
        const trues = values.filter((v) => v === true || v === 'true').length;
        distributions[field.key] = { type: 'boolean', label: field.label, trueCount: trues, falseCount: values.length - trues };
      }
    }

    return { sampleSize: matches.length, distributions };
  }

  // ─── Saved audiences ──────────────────────────────────────────────────────

  async saveAudience(businessUserId: number, dto: SaveAudienceDto) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('Business profile required');
    const matches = await this.matchingProfiles(dto.filters);
    const audience = this.audienceRepo.create({
      businessId: business.id,
      name: dto.name,
      filters: dto.filters || {},
      estimatedReach: matches.length,
    });
    return this.audienceRepo.save(audience);
  }

  async getMyAudiences(businessUserId: number) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('Business profile required');
    return this.audienceRepo.find({ where: { businessId: business.id }, order: { createdAt: 'DESC' } });
  }

  async deleteAudience(businessUserId: number, audienceId: number) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('Business profile required');
    const audience = await this.audienceRepo.findOne({ where: { id: audienceId } });
    if (!audience) throw new NotFoundException('Audience not found');
    if (audience.businessId !== business.id) throw new ForbiddenException('Not your audience');
    await this.audienceRepo.delete(audienceId);
  }

  // ─── Global data-subject rights: access log + erasure ─────────────────────
  //     POPIA, GDPR/UK GDPR, CCPA/CPRA, LGPD, PIPEDA, APP, PIPL, APPI, PDPA,
  //     DPDP, NDPR, Kenya DPA, PDPL, and equivalent right-to-access /
  //     right-to-erasure provisions worldwide.

  async getMyAccessLog(userId: number) {
    // Purge expired consents first
    const logs = await this.accessLogRepo.find({
      where: { userId },
      order: { accessedAt: 'DESC' },
      relations: ['business'],
    });
    return logs;
  }

  async adminGetAllAccessLogs() {
    return this.accessLogRepo.find({
      order: { accessedAt: 'DESC' },
      relations: ['business', 'user'],
    });
  }

  async eraseMyProfileData(userId: number) {
    await this.profileRepo.delete({ userId });
    await this.accessLogRepo.delete({ userId });
    return { erased: true, message: 'All profile data and access logs have been permanently deleted.' };
  }

  // ─── Seeding default fields ───────────────────────────────────────────────

  async seedDefaultFields() {
    const defaults: UpsertProfileFieldDto[] = [
      {
        key: 'income_range', label: 'Monthly Income Range', type: 'select', weight: 20, creditCost: 0.05, sortOrder: 0,
        options: [
          { value: 'lt_5k', label: 'Less than R5,000' },
          { value: '5k_10k', label: 'R5,000 – R10,000' },
          { value: '10k_20k', label: 'R10,000 – R20,000' },
          { value: '20k_40k', label: 'R20,000 – R40,000' },
          { value: '40k_60k', label: 'R40,000 – R60,000' },
          { value: '60k_80k', label: 'R60,000 – R80,000' },
          { value: '80k_100k', label: 'R80,000 – R100,000' },
          { value: '100k_150k', label: 'R100,000 – R150,000' },
          { value: '150k_250k', label: 'R150,000 – R250,000' },
          { value: '250k_500k', label: 'R250,000 – R500,000' },
          { value: '500k_1m', label: 'R500,000 – R1,000,000' },
          { value: 'gt_1m', label: 'More than R1,000,000' },
        ],
      },
      {
        key: 'marital_status', label: 'Marital Status', type: 'select', weight: 10, creditCost: 0.02, sortOrder: 1,
        options: [
          { value: 'single', label: 'Single' },
          { value: 'married', label: 'Married' },
          { value: 'divorced', label: 'Divorced' },
          { value: 'widowed', label: 'Widowed' },
        ],
      },
      {
        key: 'household_size', label: 'Household Size', type: 'number', weight: 10, creditCost: 0.02, sortOrder: 2, options: [],
      },
      {
        key: 'employment_status', label: 'Employment Status', type: 'select', weight: 15, creditCost: 0.03, sortOrder: 3,
        options: [
          { value: 'employed', label: 'Employed' },
          { value: 'self_employed', label: 'Self-employed' },
          { value: 'unemployed', label: 'Unemployed' },
          { value: 'student', label: 'Student' },
          { value: 'retired', label: 'Retired' },
        ],
      },
      {
        key: 'age_range', label: 'Age Range', type: 'select', weight: 10, creditCost: 0.02, sortOrder: 4,
        options: [
          { value: '18_24', label: '18 – 24' },
          { value: '25_34', label: '25 – 34' },
          { value: '35_44', label: '35 – 44' },
          { value: '45_54', label: '45 – 54' },
          { value: '55_plus', label: '55+' },
        ],
      },
      {
        key: 'province', label: 'Province', type: 'select', weight: 10, creditCost: 0.02, sortOrder: 5,
        options: [
          { value: 'gp', label: 'Gauteng' }, { value: 'wc', label: 'Western Cape' }, { value: 'kzn', label: 'KwaZulu-Natal' },
          { value: 'ec', label: 'Eastern Cape' }, { value: 'fs', label: 'Free State' }, { value: 'mp', label: 'Mpumalanga' },
          { value: 'lp', label: 'Limpopo' }, { value: 'nw', label: 'North West' }, { value: 'nc', label: 'Northern Cape' },
        ],
      },
      {
        key: 'homeowner', label: 'Homeowner', type: 'boolean', weight: 10, creditCost: 0.02, sortOrder: 6, options: [],
      },
      {
        key: 'has_vehicle', label: 'Owns a Vehicle', type: 'boolean', weight: 10, creditCost: 0.02, sortOrder: 7, options: [],
      },
      {
        key: 'education_level', label: 'Education Level', type: 'select', weight: 5, creditCost: 0.01, sortOrder: 8,
        options: [
          { value: 'matric', label: 'Matric' }, { value: 'diploma', label: 'Diploma / Certificate' },
          { value: 'degree', label: "Bachelor's Degree" }, { value: 'postgrad', label: 'Postgraduate' }, { value: 'other', label: 'Other' },
        ],
      },
      // ─── High-value lead-gen fields ───────────────────────────────────────
      {
        key: 'has_medical_aid', label: 'Has Medical Aid', type: 'boolean', weight: 15, creditCost: 0.04, sortOrder: 9, options: [],
      },
      {
        key: 'has_life_insurance', label: 'Has Life Insurance', type: 'boolean', weight: 12, creditCost: 0.03, sortOrder: 10, options: [],
      },
      {
        key: 'has_home_loan', label: 'Has Home Loan / Bond', type: 'boolean', weight: 15, creditCost: 0.04, sortOrder: 11, options: [],
      },
      {
        key: 'has_personal_loan', label: 'Has Personal Loan', type: 'boolean', weight: 12, creditCost: 0.03, sortOrder: 12, options: [],
      },
      {
        key: 'has_credit_card', label: 'Has Credit Card', type: 'boolean', weight: 10, creditCost: 0.03, sortOrder: 13, options: [],
      },
      {
        key: 'vehicle_finance_status', label: 'Vehicle Finance Status', type: 'select', weight: 12, creditCost: 0.03, sortOrder: 14,
        options: [
          { value: 'no_vehicle', label: 'No vehicle' },
          { value: 'paid_off', label: 'Paid off' },
          { value: 'on_finance', label: 'On finance / HP' },
        ],
      },
      {
        key: 'property_type', label: 'Property Type', type: 'select', weight: 10, creditCost: 0.02, sortOrder: 15,
        options: [
          { value: 'own_outright', label: 'Own outright' },
          { value: 'own_bonded', label: 'Own with bond' },
          { value: 'renting', label: 'Renting' },
          { value: 'family', label: 'Living with family' },
          { value: 'social_housing', label: 'Social / subsidised housing' },
        ],
      },
      {
        key: 'has_children', label: 'Has Children', type: 'boolean', weight: 10, creditCost: 0.02, sortOrder: 16, options: [],
      },
      {
        key: 'children_age_range', label: 'Youngest Child Age Range', type: 'select', weight: 8, creditCost: 0.02, sortOrder: 17,
        options: [
          { value: '0_2', label: '0 – 2 years' },
          { value: '3_6', label: '3 – 6 years' },
          { value: '7_12', label: '7 – 12 years' },
          { value: '13_17', label: '13 – 17 years' },
          { value: '18_plus', label: '18+' },
        ],
      },
      {
        key: 'industry_sector', label: 'Industry / Sector', type: 'select', weight: 15, creditCost: 0.04, sortOrder: 18,
        options: [
          { value: 'finance', label: 'Finance & Banking' },
          { value: 'retail', label: 'Retail & Wholesale' },
          { value: 'it', label: 'IT & Technology' },
          { value: 'healthcare', label: 'Healthcare & Medical' },
          { value: 'education', label: 'Education' },
          { value: 'construction', label: 'Construction & Property' },
          { value: 'mining', label: 'Mining & Resources' },
          { value: 'manufacturing', label: 'Manufacturing' },
          { value: 'transport', label: 'Transport & Logistics' },
          { value: 'government', label: 'Government / Public sector' },
          { value: 'hospitality', label: 'Hospitality & Tourism' },
          { value: 'agriculture', label: 'Agriculture' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'job_level', label: 'Job Level', type: 'select', weight: 15, creditCost: 0.04, sortOrder: 19,
        options: [
          { value: 'entry', label: 'Entry level' },
          { value: 'junior', label: 'Junior' },
          { value: 'mid', label: 'Mid-level' },
          { value: 'senior', label: 'Senior' },
          { value: 'manager', label: 'Manager' },
          { value: 'executive', label: 'Executive / C-suite' },
          { value: 'owner', label: 'Business owner' },
        ],
      },
      {
        key: 'monthly_expenses_range', label: 'Monthly Living Expenses', type: 'select', weight: 15, creditCost: 0.04, sortOrder: 20,
        options: [
          { value: 'lt_3k', label: 'Less than R3,000' },
          { value: '3k_7k', label: 'R3,000 – R7,000' },
          { value: '7k_15k', label: 'R7,000 – R15,000' },
          { value: '15k_30k', label: 'R15,000 – R30,000' },
          { value: 'gt_30k', label: 'More than R30,000' },
        ],
      },
      {
        key: 'savings_range', label: 'Monthly Savings / Investments', type: 'select', weight: 12, creditCost: 0.03, sortOrder: 21,
        options: [
          { value: 'none', label: 'Not saving currently' },
          { value: 'lt_500', label: 'Less than R500' },
          { value: '500_2k', label: 'R500 – R2,000' },
          { value: '2k_5k', label: 'R2,000 – R5,000' },
          { value: 'gt_5k', label: 'More than R5,000' },
        ],
      },
      {
        key: 'investment_interest', label: 'Investment Interest', type: 'select', weight: 12, creditCost: 0.04, sortOrder: 22,
        options: [
          { value: 'actively_investing', label: 'Already investing' },
          { value: 'looking', label: 'Looking to start' },
          { value: 'not_interested', label: 'Not interested currently' },
        ],
      },
      {
        key: 'preferred_payment_method', label: 'Preferred Payment Method', type: 'select', weight: 8, creditCost: 0.02, sortOrder: 23,
        options: [
          { value: 'debit_order', label: 'Debit order' },
          { value: 'credit_card', label: 'Credit card' },
          { value: 'eft', label: 'EFT / Online banking' },
          { value: 'cash', label: 'Cash' },
          { value: 'ewallet', label: 'eWallet / Digital wallet' },
        ],
      },
      {
        key: 'smartphone_type', label: 'Smartphone Type', type: 'select', weight: 5, creditCost: 0.01, sortOrder: 24,
        options: [
          { value: 'android', label: 'Android' },
          { value: 'ios', label: 'iPhone (iOS)' },
          { value: 'other', label: 'Other' },
        ],
      },
    ];

    for (const def of defaults) {
      const existing = await this.fieldRepo.findOne({ where: { key: def.key } });
      if (!existing) await this.adminUpsertField(def);
    }
  }
}
