import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { AdminInvite } from './admin-invite.entity';
import { User } from '../user/user.entity';

export type CreateInviteDto = {
  phoneNumber: string;
  role?: string;
};

type CreateOpts = { now?: Date; token?: string; ttlMs?: number };
type RedeemOpts = { now?: Date };

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LIST_LIMIT = 100;

@Injectable()
export class AdminInviteService {
  constructor(
    @InjectRepository(AdminInvite)
    private readonly invites: Repository<AdminInvite>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(invitedByUserId: number, dto: CreateInviteDto, opts: CreateOpts = {}): Promise<AdminInvite> {
    const phoneNumber = dto?.phoneNumber?.trim();
    if (!phoneNumber) throw new BadRequestException('phoneNumber is required');

    const now = opts.now ?? new Date();
    const invite = this.invites.create({
      phoneNumber,
      token: opts.token ?? randomBytes(24).toString('hex'),
      role: dto.role ?? 'admin',
      invitedByUserId,
      status: 'pending',
      expiresAt: new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS)),
      redeemedAt: null,
    });
    return this.invites.save(invite);
  }

  /**
   * Promote the calling user to the invited role. Requires the logged-in user's
   * phone to match the invite (possession of the token alone isn't enough), and
   * the invite to be pending and unexpired.
   */
  async redeem(token: string, redeemingUserId: number, opts: RedeemOpts = {}): Promise<User> {
    const invite = await this.invites.findOne({ where: { token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException('Invite already used or revoked');

    const now = opts.now ?? new Date();
    if (invite.expiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('Invite has expired');
    }

    const user = await this.users.findOne({ where: { id: redeemingUserId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.phoneNumber !== invite.phoneNumber) {
      throw new ForbiddenException('This invite was issued for a different phone number');
    }

    user.role = invite.role;
    const savedUser = await this.users.save(user);

    invite.status = 'redeemed';
    invite.redeemedAt = now;
    await this.invites.save(invite);

    return savedUser;
  }

  list(): Promise<AdminInvite[]> {
    return this.invites.find({ order: { createdAt: 'DESC' }, take: LIST_LIMIT });
  }
}
