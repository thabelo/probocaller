import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { CallPermissionRequest } from './call-permission-request.entity';
import { UpdatePrivacyPreferencesDto } from './dto/update-privacy-preferences.dto';
import { RequestCallPermissionDto } from './dto/request-call-permission.dto';
import { PayToContactService } from '../pay-to-contact/pay-to-contact.service';
import { ProfileService } from '../profile/profile.service';
import { presetFor, policyForPreset, CallPolicy } from '../call/call-policy';
import { presetForSms, policyForSmsPreset, SmsPolicy } from './sms-policy';

// Legacy callPermissionMode values → new preset names (mapped on save).
const LEGACY_MODE_ALIAS: Record<string, string> = {
  all: 'all_paid_biz',
  everyone: 'all_paid_biz',
  approved_only: 'contacts_paid_biz',
};

@Injectable()
export class DataBrokerService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(CallPermissionRequest)
    private permissionRepo: Repository<CallPermissionRequest>,
    private payToContact: PayToContactService,
    private profileService: ProfileService,
  ) {}

  async getPreferences(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const policy: CallPolicy = {
      contacts: (user.contactsCallPolicy || 'free') as any,
      business: (user.businessCallPolicy || 'paid') as any,
      newCaller: (user.newCallPolicy || 'free') as any,
      unknown: (user.unknownCallPolicy || 'free') as any,
    };
    // SMS permissions — independent, parallel sibling of the call policy above
    // (see sms-policy.ts). No shared columns or state with the call block.
    const smsPolicy: SmsPolicy = {
      contacts: (user.contactsSmsPolicy || 'free') as any,
      business: (user.businessSmsPolicy || 'paid') as any,
      newSender: (user.newSmsPolicy || 'free') as any,
      unknown: (user.unknownSmsPolicy || 'free') as any,
    };
    return {
      // Preset name is always derived from the four categories, so it never drifts.
      callPermissionMode: presetFor(policy),
      // The base tier the user selected; reverting a custom rule falls back to it.
      callBasePreset: user.callBasePreset || 'all_paid_biz',
      // Saved custom rules (standalone named policies) and which one is active
      // ('' = the base preset tier is active).
      customCallRules: user.customCallRules || [],
      selectedCustomRuleId: user.selectedCustomRuleId || '',
      contactsCallPolicy: policy.contacts,
      businessCallPolicy: policy.business,
      newCallPolicy: policy.newCaller,
      unknownCallPolicy: policy.unknown,
      allowedCallWindows: user.allowedCallWindows || [],
      // SMS permissions (see sms-policy.ts) — same shape, independent storage.
      smsPermissionMode: presetForSms(smsPolicy),
      smsBasePreset: user.smsBasePreset || 'all_paid_biz',
      customSmsRules: user.customSmsRules || [],
      selectedCustomSmsRuleId: user.selectedCustomSmsRuleId || '',
      contactsSmsPolicy: smsPolicy.contacts,
      businessSmsPolicy: smsPolicy.business,
      newSmsPolicy: smsPolicy.newSender,
      unknownSmsPolicy: smsPolicy.unknown,
      dataShareEnabled: user.dataShareEnabled,
      dataCategories: user.dataCategories || [],
      incognitoEnabled: user.incognitoEnabled,
    };
  }

  async updatePreferences(userId: number, dto: UpdatePrivacyPreferencesDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Resolve the four categories from a preset first, then let explicit
    // per-category values override.
    const policy: CallPolicy = {
      contacts: (user.contactsCallPolicy || 'free') as any,
      business: (user.businessCallPolicy || 'paid') as any,
      newCaller: (user.newCallPolicy || 'free') as any,
      unknown: (user.unknownCallPolicy || 'free') as any,
    };
    // SMS permissions — independent, parallel resolution. Never reads or
    // writes any call-policy column.
    const smsPolicy: SmsPolicy = {
      contacts: (user.contactsSmsPolicy || 'free') as any,
      business: (user.businessSmsPolicy || 'paid') as any,
      newSender: (user.newSmsPolicy || 'free') as any,
      unknown: (user.unknownSmsPolicy || 'free') as any,
    };
    // Replace the saved custom-rule list (create/rename/delete come in as the
    // full new list). Names are required and must be unique.
    if (dto.customCallRules !== undefined) {
      const seen = new Set<string>();
      for (const rule of dto.customCallRules) {
        const name = (rule.name || '').trim();
        if (!name) throw new BadRequestException('Every custom rule needs a name');
        const key = name.toLowerCase();
        if (seen.has(key)) throw new BadRequestException(`Duplicate custom rule name: ${name}`);
        seen.add(key);
      }
      user.customCallRules = dto.customCallRules;
      // If the active rule was just deleted, fall back to the base preset tier.
      const selected = user.selectedCustomRuleId || '';
      if (selected && !dto.customCallRules.some((r) => r.id === selected)) {
        user.selectedCustomRuleId = '';
        const base = policyForPreset(user.callBasePreset || 'all_paid_biz');
        if (base) Object.assign(policy, base);
      }
    }

    if (dto.callPermissionMode !== undefined) {
      const presetName = LEGACY_MODE_ALIAS[dto.callPermissionMode] ?? dto.callPermissionMode;
      const preset = policyForPreset(presetName);
      if (preset) {
        // Picking a preset tier resets all categories, becomes the new base, and
        // deselects any active custom rule (the rule itself is kept).
        Object.assign(policy, preset);
        user.callBasePreset = presetName;
        user.selectedCustomRuleId = '';
      } else if (dto.callPermissionMode === 'none') {
        policy.business = 'blocked';
      }
    }

    // Select a custom rule ('' reverts to the base preset tier). The rules and the
    // tiers form one radio group: selecting one deselects the other.
    if (dto.selectedCustomRuleId !== undefined) {
      if (dto.selectedCustomRuleId === '') {
        user.selectedCustomRuleId = '';
        const base = policyForPreset(user.callBasePreset || 'all_paid_biz');
        if (base) Object.assign(policy, base);
      } else {
        const rules = user.customCallRules || [];
        const rule = rules.find((r) => r.id === dto.selectedCustomRuleId);
        if (!rule) throw new BadRequestException('Unknown custom rule');
        user.selectedCustomRuleId = rule.id;
        policy.contacts = rule.contacts as any;
        policy.business = rule.business as any;
        policy.newCaller = rule.newCaller as any;
        policy.unknown = rule.unknown as any;
      }
    }

    if (dto.contactsCallPolicy !== undefined) policy.contacts = dto.contactsCallPolicy as any;
    if (dto.businessCallPolicy !== undefined) policy.business = dto.businessCallPolicy as any;
    if (dto.newCallPolicy !== undefined) policy.newCaller = dto.newCallPolicy as any;
    if (dto.unknownCallPolicy !== undefined) policy.unknown = dto.unknownCallPolicy as any;
    user.contactsCallPolicy = policy.contacts;
    user.businessCallPolicy = policy.business;
    user.newCallPolicy = policy.newCaller;
    user.unknownCallPolicy = policy.unknown;
    user.callPermissionMode = presetFor(policy);

    // --- SMS permissions: same structure as the call block above, fully
    // independent storage/state (see sms-policy.ts). ---

    // Replace the saved custom SMS-rule list. Names required, unique within
    // customSmsRules only (a call rule and an SMS rule may share a name).
    if (dto.customSmsRules !== undefined) {
      const seenSms = new Set<string>();
      for (const rule of dto.customSmsRules) {
        const name = (rule.name || '').trim();
        if (!name) throw new BadRequestException('Every custom SMS rule needs a name');
        const key = name.toLowerCase();
        if (seenSms.has(key)) throw new BadRequestException(`Duplicate custom SMS rule name: ${name}`);
        seenSms.add(key);
      }
      user.customSmsRules = dto.customSmsRules;
      // If the active SMS rule was just deleted, fall back to the base preset tier.
      const selectedSms = user.selectedCustomSmsRuleId || '';
      if (selectedSms && !dto.customSmsRules.some((r) => r.id === selectedSms)) {
        user.selectedCustomSmsRuleId = '';
        const base = policyForSmsPreset(user.smsBasePreset || 'all_paid_biz');
        if (base) Object.assign(smsPolicy, base);
      }
    }

    if (dto.smsPermissionMode !== undefined) {
      const preset = policyForSmsPreset(dto.smsPermissionMode);
      if (preset) {
        // Picking a preset tier resets all categories, becomes the new base, and
        // deselects any active custom rule (the rule itself is kept).
        Object.assign(smsPolicy, preset);
        user.smsBasePreset = dto.smsPermissionMode;
        user.selectedCustomSmsRuleId = '';
      }
    }

    // Select a custom SMS rule ('' reverts to the base preset tier).
    if (dto.selectedCustomSmsRuleId !== undefined) {
      if (dto.selectedCustomSmsRuleId === '') {
        user.selectedCustomSmsRuleId = '';
        const base = policyForSmsPreset(user.smsBasePreset || 'all_paid_biz');
        if (base) Object.assign(smsPolicy, base);
      } else {
        const rules = user.customSmsRules || [];
        const rule = rules.find((r) => r.id === dto.selectedCustomSmsRuleId);
        if (!rule) throw new BadRequestException('Unknown custom SMS rule');
        user.selectedCustomSmsRuleId = rule.id;
        smsPolicy.contacts = rule.contacts as any;
        smsPolicy.business = rule.business as any;
        smsPolicy.newSender = rule.newSender as any;
        smsPolicy.unknown = rule.unknown as any;
      }
    }

    if (dto.contactsSmsPolicy !== undefined) smsPolicy.contacts = dto.contactsSmsPolicy as any;
    if (dto.businessSmsPolicy !== undefined) smsPolicy.business = dto.businessSmsPolicy as any;
    if (dto.newSmsPolicy !== undefined) smsPolicy.newSender = dto.newSmsPolicy as any;
    if (dto.unknownSmsPolicy !== undefined) smsPolicy.unknown = dto.unknownSmsPolicy as any;
    user.contactsSmsPolicy = smsPolicy.contacts;
    user.businessSmsPolicy = smsPolicy.business;
    user.newSmsPolicy = smsPolicy.newSender;
    user.unknownSmsPolicy = smsPolicy.unknown;
    user.smsPermissionMode = presetForSms(smsPolicy);

    if (dto.allowedCallWindows !== undefined) user.allowedCallWindows = dto.allowedCallWindows;
    if (dto.dataShareEnabled !== undefined) user.dataShareEnabled = dto.dataShareEnabled;
    if (dto.dataCategories !== undefined) {
      // Explicit selection (incl. deselections) always wins.
      user.dataCategories = dto.dataCategories;
    } else if (dto.dataShareEnabled === true) {
      // "Share all filled fields": turning sharing on with no explicit selection
      // opts in every profile field the user has filled.
      user.dataCategories = await this.profileService.sharableCandidateKeys(userId);
    }
    if (dto.incognitoEnabled !== undefined) user.incognitoEnabled = dto.incognitoEnabled;
    await this.userRepo.save(user);
    return this.getPreferences(userId);
  }

  async requestCallPermission(businessUserId: number, dto: RequestCallPermissionDto) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('Only registered businesses can request call permissions');

    const targetUser = await this.userRepo.findOne({ where: { id: dto.targetUserId } });
    if (!targetUser) throw new NotFoundException('Target user not found');

    const existing = await this.permissionRepo.findOne({
      where: { businessId: business.id, userId: dto.targetUserId, status: 'pending' },
    });
    if (existing) throw new ConflictException('A pending request already exists for this user');

    const request = this.permissionRepo.create({
      businessId: business.id,
      userId: dto.targetUserId,
      pitch: dto.pitch || null,
      callCategory: dto.callCategory || null,
      status: 'pending',
    });
    const saved = await this.permissionRepo.save(request);

    // Pay-to-Contact: stake the bid now (debits the business wallet and holds
    // the escrow against this request). An explicit per-request bid wins;
    // otherwise fall back to the business's configured default bid. Postgres
    // returns numeric columns as strings, so coerce before comparing.
    const bid =
      dto.bidAmount && dto.bidAmount > 0
        ? dto.bidAmount
        : Number(business.defaultBidAmount) || 0;
    if (bid > 0) {
      await this.payToContact.stake(businessUserId, saved.id, bid);
    }

    // Notify the target user
    const notifications = targetUser.notifications || [];
    notifications.push({
      id: Date.now(),
      message: `${business.companyName} wants permission to call you${dto.pitch ? `: "${dto.pitch}"` : ''}. Open Privacy settings to respond.`,
      timestamp: new Date(),
      read: false,
    });
    targetUser.notifications = notifications;
    await this.userRepo.save(targetUser);

    return saved;
  }

  /**
   * Respond to a call-permission request. `freeWindowMs`, when given on an
   * approval, grants the business a FREE call window (whitelist): the grant is
   * marked free with an expiry, and any staked escrow is refunded (the caller
   * isn't charged since the call is free). Without it, approval settles the
   * escrow (Pay-to-Contact), rejection refunds it.
   */
  async respondToRequest(userId: number, requestId: number, approved: boolean, freeWindowMs?: number) {
    const request = await this.permissionRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.userId !== userId) throw new ForbiddenException('This request is not for you');
    if (request.status !== 'pending') throw new ConflictException('Request already responded to');

    const free = approved && !!freeWindowMs && freeWindowMs > 0;
    request.status = approved ? 'approved' : 'rejected';
    if (approved) request.approvedAt = new Date();
    if (free) {
      request.freeCall = true;
      request.expiresAt = new Date(Date.now() + freeWindowMs!);
    }
    const saved = await this.permissionRepo.save(request);

    // Escrow: a free grant refunds the stake (no charge); a plain approval
    // settles it to the user; a rejection refunds it. Only acts when held.
    if (request.escrowStatus === 'held') {
      if (approved && !free) {
        await this.payToContact.settle(requestId);
      } else {
        await this.payToContact.refund(requestId);
      }
    }

    return saved;
  }

  /**
   * Is the calling business currently free-whitelisted to call this recipient?
   * True when an approved, free grant from one of the caller's businesses is
   * still within its window.
   */
  async isFreeWhitelisted(recipientUserId: number, callerBusinessUserId: number): Promise<boolean> {
    const businesses = await this.businessRepo.find({ where: { userId: callerBusinessUserId } });
    if (!businesses.length) return false;
    const grant = await this.permissionRepo.findOne({
      where: {
        userId: recipientUserId,
        businessId: In(businesses.map((b) => b.id)),
        status: 'approved',
        freeCall: true,
        expiresAt: MoreThan(new Date()),
      },
    });
    return !!grant;
  }

  /**
   * Same whitelist check, keyed on a resolved BUSINESS id. Incoming-call
   * lookups identify the caller via the calling number → business, not via the
   * owner's user id (which for a last-10 lookup is just a placeholder user), and
   * grants are stored per business — so this is the correct key for caller-ID.
   */
  async isFreeWhitelistedForBusiness(recipientUserId: number, businessId: number | null): Promise<boolean> {
    if (!businessId) return false;
    const grant = await this.permissionRepo.findOne({
      where: {
        userId: recipientUserId,
        businessId,
        status: 'approved',
        freeCall: true,
        expiresAt: MoreThan(new Date()),
      },
    });
    return !!grant;
  }

  async getMyRequests(userId: number) {
    return this.permissionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['business'],
    });
  }

  async getApprovedCallers(userId: number) {
    return this.permissionRepo.find({
      where: { userId, status: 'approved' },
      order: { approvedAt: 'DESC' },
      relations: ['business'],
    });
  }

  async getBusinessRequests(businessUserId: number) {
    const business = await this.businessRepo.findOne({ where: { userId: businessUserId } });
    if (!business) throw new ForbiddenException('No business profile found');
    return this.permissionRepo.find({
      where: { businessId: business.id },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async revokePermission(userId: number, requestId: number) {
    const request = await this.permissionRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.userId !== userId) throw new ForbiddenException('This request is not for you');
    request.status = 'rejected';
    return this.permissionRepo.save(request);
  }

  // Used by CallService to check if a business has approval to call a user
  async hasApproval(businessId: number, userId: number): Promise<boolean> {
    const r = await this.permissionRepo.findOne({
      where: { businessId, userId, status: 'approved' },
    });
    return !!r;
  }

  /**
   * Whether a business caller may reach this recipient, per the recipient's own
   * call-permission mode. Lets the incoming-call UI auto-reject a disallowed
   * business call before it rings — mirrors the gate in CallService.initiateCall.
   */
  async isBusinessCallerAllowed(recipientUserId: number, _callerBusinessId: number | null): Promise<boolean> {
    const recipient = await this.userRepo.findOne({ where: { id: recipientUserId } });
    // Business callers are gated purely by the business dial: blocked → rejected,
    // free/paid → allowed to ring (free vs paid only affects billing).
    const business = recipient?.businessCallPolicy || 'paid';
    return business !== 'blocked';
  }

  async adminGetAllRequests() {
    return this.permissionRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['business', 'user'],
    });
  }
}
