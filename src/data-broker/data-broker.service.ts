import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { CallPermissionRequest } from './call-permission-request.entity';
import { UpdatePrivacyPreferencesDto } from './dto/update-privacy-preferences.dto';
import { RequestCallPermissionDto } from './dto/request-call-permission.dto';
import { PayToContactService } from '../pay-to-contact/pay-to-contact.service';
import { presetFor, policyForPreset } from '../call/call-policy';

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
  ) {}

  async getPreferences(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const personal = (user.personalCallPolicy || 'everyone') as any;
    const business = (user.businessCallPolicy || 'paid') as any;
    return {
      // Preset name is always derived from the two dials, so it never drifts.
      callPermissionMode: presetFor({ personal, business }),
      personalCallPolicy: personal,
      businessCallPolicy: business,
      allowedCallWindows: user.allowedCallWindows || [],
      dataShareEnabled: user.dataShareEnabled,
      dataCategories: user.dataCategories || [],
      incognitoEnabled: user.incognitoEnabled,
    };
  }

  async updatePreferences(userId: number, dto: UpdatePrivacyPreferencesDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Resolve the two dials from a preset first, then let explicit dials override.
    let personal = user.personalCallPolicy || 'everyone';
    let business = user.businessCallPolicy || 'paid';
    if (dto.callPermissionMode !== undefined) {
      const preset = policyForPreset(LEGACY_MODE_ALIAS[dto.callPermissionMode] ?? dto.callPermissionMode);
      if (preset) {
        personal = preset.personal;
        business = preset.business;
      } else if (dto.callPermissionMode === 'none') {
        personal = 'everyone';
        business = 'blocked';
      }
    }
    if (dto.personalCallPolicy !== undefined) personal = dto.personalCallPolicy;
    if (dto.businessCallPolicy !== undefined) business = dto.businessCallPolicy;
    user.personalCallPolicy = personal;
    user.businessCallPolicy = business;
    user.callPermissionMode = presetFor({ personal: personal as any, business: business as any });

    if (dto.allowedCallWindows !== undefined) user.allowedCallWindows = dto.allowedCallWindows;
    if (dto.dataShareEnabled !== undefined) user.dataShareEnabled = dto.dataShareEnabled;
    if (dto.dataCategories !== undefined) user.dataCategories = dto.dataCategories;
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

  async respondToRequest(userId: number, requestId: number, approved: boolean) {
    const request = await this.permissionRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.userId !== userId) throw new ForbiddenException('This request is not for you');
    if (request.status !== 'pending') throw new ConflictException('Request already responded to');

    request.status = approved ? 'approved' : 'rejected';
    if (approved) request.approvedAt = new Date();
    const saved = await this.permissionRepo.save(request);

    // Pay-to-Contact: release the staked escrow to the user on approval, or
    // refund it to the business on rejection. Only acts when a stake is held.
    if (request.escrowStatus === 'held') {
      if (approved) {
        await this.payToContact.settle(requestId);
      } else {
        await this.payToContact.refund(requestId);
      }
    }

    return saved;
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
