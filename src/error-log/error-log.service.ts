import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorLog, ErrorLogLevel, ErrorLogSource } from './error-log.entity';

export type RecordErrorDto = {
  source: ErrorLogSource;
  level?: ErrorLogLevel;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  appVersion?: string;
  platform?: string;
};

export type ListFilter = {
  level?: ErrorLogLevel;
  source?: ErrorLogSource;
  limit?: number;
};

const VALID_SOURCES: ErrorLogSource[] = ['mobile', 'web', 'server'];
const VALID_LEVELS: ErrorLogLevel[] = ['error', 'warn', 'fatal'];
const MESSAGE_MAX = 2000;
const STACK_MAX = 20_000;
const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 500;

@Injectable()
export class ErrorLogService {
  constructor(
    @InjectRepository(ErrorLog)
    private readonly repo: Repository<ErrorLog>,
  ) {}

  async record(dto: RecordErrorDto): Promise<ErrorLog> {
    if (!dto?.message?.trim()) throw new BadRequestException('message is required');
    if (!VALID_SOURCES.includes(dto?.source)) {
      throw new BadRequestException(`source must be one of: ${VALID_SOURCES.join(', ')}`);
    }
    const level = dto.level ?? 'error';
    if (!VALID_LEVELS.includes(level)) {
      throw new BadRequestException(`level must be one of: ${VALID_LEVELS.join(', ')}`);
    }
    const row = this.repo.create({
      source: dto.source,
      level,
      message: dto.message.trim().slice(0, MESSAGE_MAX),
      stack: dto.stack?.slice(0, STACK_MAX) || null,
      context: dto.context ?? null,
      appVersion: dto.appVersion?.trim() || null,
      platform: dto.platform?.trim() || null,
    });
    return this.repo.save(row);
  }

  list(filter: ListFilter = {}): Promise<ErrorLog[]> {
    const take = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const opts: any = { order: { createdAt: 'DESC' }, take };
    const where: any = {};
    if (filter.level) where.level = filter.level;
    if (filter.source) where.source = filter.source;
    if (Object.keys(where).length) opts.where = where;
    return this.repo.find(opts);
  }
}
