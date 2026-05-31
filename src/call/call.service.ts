import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallLog } from './call.entity';
import { CallRating } from './call-rating.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Setting } from '../config/setting.entity';
import { TransactionService } from '../transaction/transaction.service';
import { DataBrokerService } from '../data-broker/data-broker.service';

const DEFAULT_RATE_PER_SECOND = 0.002;
const DEFAULT_PLATFORM_CUT_RATE = 0.24;

@Injectable()
export class CallService {
  constructor(
    @InjectRepository(CallLog)
    private callRepository: Repository<CallLog>,
    @InjectRepository(CallRating)
    private ratingRepository: Repository<CallRating>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    private readonly transactionService: TransactionService,
    private readonly dataBrokerService: DataBrokerService,
  ) {}

  private async getRatePerSecond(): Promise<number> {
    const s = await this.settingRepository.findOne({ where: { key: 'RATE_PER_SECOND' } });
    return s ? parseFloat(s.value) || DEFAULT_RATE_PER_SECOND : DEFAULT_RATE_PER_SECOND;
  }

  private async getPlatformCutRate(): Promise<number> {
    const s = await this.settingRepository.findOne({ where: { key: 'PLATFORM_CUT_RATE' } });
    return s ? parseFloat(s.value) || DEFAULT_PLATFORM_CUT_RATE : DEFAULT_PLATFORM_CUT_RATE;
  }

  private isWithinCallWindows(windows: { dayOfWeek: number; startTime: string; endTime: string }[]): boolean {
    if (!windows || windows.length === 0) return true;
    const now = new Date();
    const day = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return windows.some(w => w.dayOfWeek === day && hhmm >= w.startTime && hhmm <= w.endTime);
  }

  private recomputeTier(business: Business): string {
    if (!business.verified) return 'unverified';
    const avg = Number(business.averageRating);
    const total = business.totalRatings;
    if (avg >= 4.5 && total >= 50) return 'premium';
    if (avg >= 3.5 && total >= 10) return 'trusted';
    return 'verified';
  }

  async initiateCall(fromUserId: number, toPhoneNumber: string): Promise<{ call: CallLog; blocked: boolean; voiceNote: boolean; message: string }> {
    const fromUser = await this.userRepository.findOne({ where: { id: fromUserId } });
    if (!fromUser) throw new NotFoundException('User not found');

    let toUser = await this.userRepository.findOne({ where: { phoneNumber: toPhoneNumber } });
    if (!toUser) {
      toUser = this.userRepository.create({
        phoneNumber: toPhoneNumber,
        email: `${toPhoneNumber}@probo.local`,
        name: 'Unknown',
      });
      await this.userRepository.save(toUser);
    }

    const ratePerSecond = await this.getRatePerSecond();

    // Caller (business) has insufficient wallet balance
    if (fromUser.isBusiness && Number(fromUser.walletBalance) < ratePerSecond) {
      const blockedCall = this.callRepository.create({
        fromUserId,
        toUserId: toUser.id,
        status: 'blocked',
        ratePerSecond,
        blockedReason: 'LOW_FUNDS',
        completedAt: new Date(),
      });
      await this.callRepository.save(blockedCall);
      await this.addNotification(
        fromUser.id,
        'Your call was blocked — wallet balance is too low. Please top up your account to continue making calls.',
      );
      return { call: blockedCall, blocked: true, voiceNote: true, message: 'Hello, Your call is blocked by Probo Caller, please load funds. Visit ProboCaller dot com to learn more.  Your call is blocked by Probo Caller, please load funds. Visit Probo Caller dot com to learn more. Goodbye!' };
    }

    // Receiver (business) has insufficient wallet balance to accept the call
    if (toUser.isBusiness && Number(toUser.walletBalance) < ratePerSecond) {
      const blockedCall = this.callRepository.create({
        fromUserId,
        toUserId: toUser.id,
        status: 'blocked',
        ratePerSecond,
        blockedReason: 'LOW_FUNDS',
        completedAt: new Date(),
      });
      await this.callRepository.save(blockedCall);
      await this.addNotification(
        toUser.id,
        'An incoming call was blocked because your wallet balance is too low. Top up your account to receive calls.',
      );
      return { call: blockedCall, blocked: true, voiceNote: true, message: 'Hello, Your call is blocked by Probo Caller, please load funds. Visit ProboCaller dot com to learn more.  Your call is blocked by Probo Caller, please load funds. Visit Probo Caller dot com to learn more. Goodbye!' };
    }

    // Data broker: check call windows first (applies to all callers)
    const windows = toUser.allowedCallWindows || [];
    if (windows.length > 0 && !this.isWithinCallWindows(windows)) {
      const blockedCall = this.callRepository.create({
        fromUserId,
        toUserId: toUser.id,
        status: 'blocked',
        ratePerSecond,
        blockedReason: 'OUTSIDE_CALL_WINDOW',
        completedAt: new Date(),
      });
      await this.callRepository.save(blockedCall);
      return { call: blockedCall, blocked: true, voiceNote: true, message: 'This person is not accepting calls at this time.' };
    }

    // Data broker: check call permission mode
    const permMode = toUser.callPermissionMode || 'all';
    if (permMode === 'none') {
      const blockedCall = this.callRepository.create({
        fromUserId,
        toUserId: toUser.id,
        status: 'blocked',
        ratePerSecond,
        blockedReason: 'PERMISSION_REQUIRED',
        completedAt: new Date(),
      });
      await this.callRepository.save(blockedCall);
      return { call: blockedCall, blocked: true, voiceNote: true, message: 'This person is not accepting calls through Probo Caller.' };
    }
    if (permMode === 'approved_only') {
      const callerBusiness = await this.businessRepository.findOne({ where: { userId: fromUserId } });
      const hasApproval = callerBusiness
        ? await this.dataBrokerService.hasApproval(callerBusiness.id, toUser.id)
        : false;
      if (!hasApproval) {
        const blockedCall = this.callRepository.create({
          fromUserId,
          toUserId: toUser.id,
          status: 'blocked',
          ratePerSecond,
          blockedReason: 'PERMISSION_REQUIRED',
          completedAt: new Date(),
        });
        await this.callRepository.save(blockedCall);
        return { call: blockedCall, blocked: true, voiceNote: true, message: 'You need call permission from this user. Request it via the Data Broker portal.' };
      }
    }

    const recipientBlocksCaller = fromUser.spamList?.includes(toUser.phoneNumber);
    if (recipientBlocksCaller) {
      const blockedReason = 'USER_BLOCKED';
      const blockedCall = this.callRepository.create({
        fromUserId,
        toUserId: toUser.id,
        status: 'blocked',
        ratePerSecond,
        blockedReason,
        completedAt: new Date(),
      });
      await this.callRepository.save(blockedCall);
      return { call: blockedCall, blocked: true, voiceNote: false, message: 'You have blocked this number.' };
    }

    const call = this.callRepository.create({ fromUserId, toUserId: toUser.id, status: 'initiated', ratePerSecond });
    await this.callRepository.save(call);

    return { call, blocked: false, voiceNote: false, message: 'Call initiated' };
  }

  async completeCall(requestingUserId: number, callId: number, duration: number): Promise<CallLog> {
    const call = await this.callRepository.findOne({ where: { id: callId }, relations: ['fromUser', 'toUser'] });
    if (!call) throw new NotFoundException('Call not found');

    // Authorization: only a participant in the call can complete it.
    // Without this check, any authenticated user could complete any call and trigger fund transfers.
    if (call.fromUserId !== requestingUserId && call.toUserId !== requestingUserId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    // Idempotency / replay protection: once a call is completed (or blocked),
    // re-submitting completion must not double-charge / double-credit.
    if (call.status === 'completed') {
      return call;
    }
    if (call.status === 'blocked') {
      throw new BadRequestException('Cannot complete a blocked call');
    }

    // Re-validate duration server-side. DTO already enforces 0 ≤ duration ≤ 3600,
    // but defence in depth in case the service is called from elsewhere.
    if (!Number.isFinite(duration) || duration < 0 || duration > 3600) {
      throw new BadRequestException('Invalid call duration');
    }

    call.duration = duration;
    call.status = 'completed';
    call.completedAt = new Date();

    const callerUser = await this.userRepository.findOne({ where: { id: call.toUserId } });

    if (callerUser?.isBusiness) {
      const platformCutRate = await this.getPlatformCutRate();
      const rate = Number(call.ratePerSecond) || DEFAULT_RATE_PER_SECOND;
      const businessCost = parseFloat((duration * rate).toFixed(6));
      const platformCut = parseFloat((businessCost * platformCutRate).toFixed(6));
      const userEarnings = parseFloat((businessCost * (1 - platformCutRate)).toFixed(6));

      call.cost = businessCost;
      call.platformCut = platformCut;
      call.userEarnings = userEarnings;

      callerUser.walletBalance = parseFloat((Number(callerUser.walletBalance) - businessCost).toFixed(6));
      await this.userRepository.save(callerUser);
      await this.transactionService.log(
        callerUser.id,
        'CALL_CHARGE',
        -businessCost,
        `${duration}s call to ${call.fromUser?.phoneNumber || 'user'} — rate $${rate}/s`,
        callId,
      );

      const receiverUser = await this.userRepository.findOne({ where: { id: call.fromUserId } });
      if (receiverUser) {
        receiverUser.walletBalance = parseFloat((Number(receiverUser.walletBalance) + userEarnings).toFixed(6));
        await this.userRepository.save(receiverUser);
        await this.addNotification(receiverUser.id, `You earned $${userEarnings.toFixed(4)} from a ${duration}s business call`);
        await this.transactionService.log(
          receiverUser.id,
          'CALL_EARN',
          userEarnings,
          `Earned from ${duration}s business call from ${call.toUser?.name || call.toUser?.phoneNumber || 'business'}`,
          callId,
        );
      }
    }

    await this.callRepository.save(call);
    return call;
  }

  async getCallHistory(userId: number, period?: string): Promise<CallLog[]> {
    const qb = this.callRepository
      .createQueryBuilder('call')
      .leftJoinAndSelect('call.fromUser', 'fromUser')
      .leftJoinAndSelect('call.toUser', 'toUser')
      .where('call.fromUserId = :userId OR call.toUserId = :userId', { userId })
      .orderBy('call.startedAt', 'DESC');

    if (period && period !== 'all') {
      const now = new Date();
      let from: Date | undefined;
      if (period === 'day') {
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'month') {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      if (from) {
        qb.andWhere('call.startedAt >= :from', { from });
      }
    }

    return qb.getMany();
  }

  async rateCall(raterId: number, callId: number, rating: number, comment?: string): Promise<CallRating> {
    const call = await this.callRepository.findOne({ where: { id: callId }, relations: ['fromUser', 'toUser'] });
    if (!call) throw new NotFoundException('Call not found');
    if (call.status !== 'completed') throw new BadRequestException('Only completed calls can be rated');
    if (call.fromUserId !== raterId) throw new ForbiddenException('Only the call recipient can rate the business');

    const existing = await this.ratingRepository.findOne({ where: { callId } });
    if (existing) throw new ConflictException('This call has already been rated');

    // Resolve which business made the call (toUser is the business caller)
    const business = await this.businessRepository.findOne({ where: { userId: call.toUserId } });
    if (!business) throw new BadRequestException('This call was not from a business');

    const callRating = this.ratingRepository.create({
      callId,
      raterId,
      businessId: business.id,
      rating,
      comment: comment || null,
    });
    await this.ratingRepository.save(callRating);

    // Recompute business average rating
    const allRatings = await this.ratingRepository.find({ where: { businessId: business.id } });
    business.totalRatings = allRatings.length;
    business.averageRating = parseFloat(
      (allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(2),
    );
    business.tier = this.recomputeTier(business);
    await this.businessRepository.save(business);

    return callRating;
  }

  async getCallRating(callId: number): Promise<CallRating | null> {
    return this.ratingRepository.findOne({ where: { callId } });
  }

  private async addNotification(userId: number, message: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;
    const notifications = user.notifications || [];
    notifications.push({ id: Date.now(), message, timestamp: new Date(), read: false });
    user.notifications = notifications;
    await this.userRepository.save(user);
  }
}
