import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invite, InviteStatus } from './invite.entity';
import { User } from '../user/user.entity';
import { toE164 } from '../auth/phone-variants';

export type RecordInviteDto = {
  phoneNumber: string;
};

export type ListFilter = {
  status?: InviteStatus;
  limit?: number;
};

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 500;

@Injectable()
export class InviteService {
  constructor(
    @InjectRepository(Invite)
    private readonly repo: Repository<Invite>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Record that `inviterUserId` invited `phoneNumber` to join.
   *
   * The number is canonicalised on the way in: signup matches invites on the
   * E.164 form, so an invite stored exactly as typed ("082…") would never be
   * found again when the invitee joins as +27….
   */
  async record(inviterUserId: number, dto: RecordInviteDto): Promise<Invite> {
    const phoneNumber = toE164(String(dto?.phoneNumber ?? '').trim());
    if (!phoneNumber) throw new BadRequestException('phoneNumber is required');

    const inviter = await this.users.findOne({ where: { id: inviterUserId } });
    if (!inviter) throw new BadRequestException('inviter not found');

    // Inviting yourself would mint a self-referral and, with it, a 3% loop.
    if (toE164(inviter.phoneNumber || '') === phoneNumber) {
      throw new BadRequestException('You cannot invite your own number');
    }

    // Re-inviting is a normal nudge; refresh the existing row so the admin view
    // counts people invited rather than attempts made.
    const existing = await this.repo.findOne({ where: { inviterUserId, phoneNumber } });
    if (existing) {
      // Never un-accept someone who has already joined.
      if (existing.status !== 'accepted') existing.status = 'sent';
      existing.referralCode = inviter.referralCode;
      return this.repo.save(existing);
    }

    const row = this.repo.create({
      inviterUserId,
      phoneNumber,
      referralCode: inviter.referralCode,
      channel: 'sms',
      status: 'sent',
      acceptedAt: null,
    });
    return this.repo.save(row);
  }

  /**
   * Called when someone signs up, to close the loop on whoever invited them.
   * Silent when nobody did — most signups are not invited.
   */
  async markAccepted(phoneNumber: string): Promise<Invite | null> {
    const canonical = toE164(String(phoneNumber ?? '').trim());
    if (!canonical) return null;

    const invite = await this.repo.findOne({
      where: { phoneNumber: canonical, status: 'sent' },
      order: { createdAt: 'DESC' },
    });
    if (!invite) return null;

    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    return this.repo.save(invite);
  }

  listForAdmin(filter: ListFilter = {}): Promise<Invite[]> {
    const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const opts: any = { order: { createdAt: 'DESC' }, take };
    if (filter.status) opts.where = { status: filter.status };
    return this.repo.find(opts);
  }
}
