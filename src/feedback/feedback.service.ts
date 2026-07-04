import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback, FeedbackCategory, FeedbackStatus } from './feedback.entity';

export type SubmitFeedbackDto = {
  category: FeedbackCategory;
  message: string;
  appVersion?: string;
  platform?: string;
};

export type ListFilter = {
  status?: FeedbackStatus;
  limit?: number;
};

const VALID_CATEGORIES: FeedbackCategory[] = ['bug', 'suggestion', 'other'];
const MESSAGE_MAX = 3000;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 500;

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly repo: Repository<Feedback>,
  ) {}

  async submit(userId: number, dto: SubmitFeedbackDto): Promise<Feedback> {
    if (!dto?.message?.trim()) throw new BadRequestException('message is required');
    if (!VALID_CATEGORIES.includes(dto?.category)) {
      throw new BadRequestException(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    const row = this.repo.create({
      userId,
      category: dto.category,
      message: dto.message.trim().slice(0, MESSAGE_MAX),
      appVersion: dto.appVersion?.trim() || null,
      platform: dto.platform?.trim() || null,
      status: 'open',
    });
    return this.repo.save(row);
  }

  listForAdmin(filter: ListFilter = {}): Promise<Feedback[]> {
    const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const opts: any = { order: { createdAt: 'DESC' }, take };
    if (filter.status) opts.where = { status: filter.status };
    return this.repo.find(opts);
  }
}
