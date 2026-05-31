import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpamReport } from './spam-report.entity';

export type SpamReportDto = {
  senderHash: string;
  bodyHash: string;
  matchedPattern: string;
};

const HEX64 = /^[0-9a-f]{64}$/;
const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 1000;

// Privacy guard — the shared spam DB must NEVER receive plaintext PII.
const FORBIDDEN_PLAINTEXT_FIELDS = ['sender', 'body', 'message', 'text', 'phoneNumber', 'bodySnippet'] as const;

@Injectable()
export class SpamReportService {
  constructor(
    @InjectRepository(SpamReport)
    private readonly repo: Repository<SpamReport>,
  ) {}

  async report(userId: number, dto: SpamReportDto): Promise<SpamReport> {
    for (const k of FORBIDDEN_PLAINTEXT_FIELDS) {
      if ((dto as any)[k] != null) {
        throw new BadRequestException(`plaintext field "${k}" is not accepted — send only hashed identifiers`);
      }
    }
    if (!HEX64.test(dto?.senderHash ?? '')) {
      throw new BadRequestException('senderHash must be a 64-char lowercase hex SHA-256 digest');
    }
    if (!HEX64.test(dto?.bodyHash ?? '')) {
      throw new BadRequestException('bodyHash must be a 64-char lowercase hex SHA-256 digest');
    }
    if (!dto?.matchedPattern?.trim()) {
      throw new BadRequestException('matchedPattern is required');
    }
    const row = this.repo.create({
      userId,
      senderHash: dto.senderHash,
      bodyHash: dto.bodyHash,
      matchedPattern: dto.matchedPattern,
    });
    return this.repo.save(row);
  }

  getRecent(limit = DEFAULT_LIMIT): Promise<SpamReport[]> {
    const take = Math.min(Math.max(1, limit), HARD_LIMIT);
    return this.repo.find({ order: { createdAt: 'DESC' }, take });
  }
}
