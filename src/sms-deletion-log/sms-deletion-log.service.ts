import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsDeletionLog } from './sms-deletion-log.entity';

export type LogDeletionDto = {
  sender: string;
  matchedPattern: string;
  matchedText?: string;
  bodyEncrypted?: string;
  iv?: string;
  note?: string;
};

const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 500;

// Privacy guard — the server must NEVER accept plaintext SMS bodies.
const PLAINTEXT_FIELDS = ['body', 'bodySnippet', 'message', 'text'] as const;

@Injectable()
export class SmsDeletionLogService {
  constructor(
    @InjectRepository(SmsDeletionLog)
    private readonly repo: Repository<SmsDeletionLog>,
  ) {}

  async log(userId: number, dto: LogDeletionDto): Promise<SmsDeletionLog> {
    if (!dto?.sender?.trim()) throw new BadRequestException('sender is required');
    if (!dto?.matchedPattern?.trim()) throw new BadRequestException('matchedPattern is required');

    for (const k of PLAINTEXT_FIELDS) {
      if ((dto as any)[k] != null) {
        throw new BadRequestException(`plaintext field "${k}" is not accepted — encrypt client-side and send {bodyEncrypted, iv} instead`);
      }
    }

    const hasCt = !!dto.bodyEncrypted;
    const hasIv = !!dto.iv;
    if (hasCt !== hasIv) {
      throw new BadRequestException('bodyEncrypted and iv must be supplied together');
    }

    const row = this.repo.create({
      userId,
      sender: dto.sender,
      matchedPattern: dto.matchedPattern,
      matchedText: dto.matchedText,
      bodyEncrypted: dto.bodyEncrypted,
      iv: dto.iv,
      note: dto.note,
    });
    return this.repo.save(row);
  }

  getAll(userId: number, limit = DEFAULT_LIMIT): Promise<SmsDeletionLog[]> {
    const take = Math.min(Math.max(1, limit), HARD_LIMIT);
    return this.repo.find({
      where: { userId },
      order: { deletedAt: 'DESC' },
      take,
    });
  }

  async clear(userId: number): Promise<number> {
    const result = await this.repo.delete({ userId });
    return result.affected ?? 0;
  }
}
