import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ReportedSms, ReportReason, ReportStatus } from './reported-sms.entity';

export type ReportDto = {
  sender: string;
  body: string;
  reason: ReportReason;
  userNote?: string;
};

export type UpdateStatusDto = {
  status: ReportStatus;
  adminNotes?: string;
};

export type ListFilter = {
  status?: ReportStatus;
  limit?: number;
};

const VALID_REASONS: ReportReason[] = ['spam', 'scam', 'phishing', 'harassment', 'other'];
const VALID_STATUSES: ReportStatus[] = ['pending', 'confirmed', 'dismissed'];
const BODY_MAX = 1600;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 500;

@Injectable()
export class ReportedSmsService {
  constructor(
    @InjectRepository(ReportedSms)
    private readonly repo: Repository<ReportedSms>,
  ) {}

  async report(reporterUserId: number, dto: ReportDto): Promise<ReportedSms> {
    if (!dto?.sender?.trim()) throw new BadRequestException('sender is required');
    if (!dto?.body?.trim()) throw new BadRequestException('body is required');
    if (!VALID_REASONS.includes(dto?.reason)) {
      throw new BadRequestException(`reason must be one of: ${VALID_REASONS.join(', ')}`);
    }

    const row = this.repo.create({
      reporterUserId,
      sender: dto.sender.trim(),
      body: dto.body.slice(0, BODY_MAX),
      reason: dto.reason,
      userNote: dto.userNote?.trim() || null,
      status: 'pending',
    });
    return this.repo.save(row);
  }

  /**
   * Count non-dismissed scam-SMS reports for a sender number. Used by Scam
   * Shield as a risk signal. Admin-dismissed reports are excluded so a cleared
   * number isn't penalised.
   */
  async countBySender(sender: string): Promise<number> {
    const trimmed = (sender ?? '').trim();
    if (!trimmed) return 0;
    return this.repo.count({ where: { sender: trimmed, status: Not('dismissed') } });
  }

  listForAdmin(filter: ListFilter = {}): Promise<ReportedSms[]> {
    const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const opts: any = { order: { createdAt: 'DESC' }, take };
    if (filter.status) opts.where = { status: filter.status };
    return this.repo.find(opts);
  }

  async updateStatus(adminUserId: number, id: number, dto: UpdateStatusDto): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`report ${id} not found`);
    if (!VALID_STATUSES.includes(dto?.status)) {
      throw new BadRequestException(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    await this.repo.update({ id }, {
      status: dto.status,
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      adminNotes: dto.adminNotes?.trim() || null,
    });
  }
}
