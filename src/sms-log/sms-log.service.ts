import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsLog } from './sms-log.entity';
import { CreateSmsLogDto } from './dto/create-sms-log.dto';
import { normalizeNumber } from '../suppression/number-hash';

@Injectable()
export class SmsLogService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly repo: Repository<SmsLog>,
  ) {}

  async create(userId: number, dto: CreateSmsLogDto): Promise<SmsLog> {
    const log = this.repo.create({
      userId,
      address: normalizeNumber(dto.address),
      bodyHash: dto.bodyHash,
      category: dto.category,
      decision: dto.decision,
    });
    return this.repo.save(log);
  }

  findAllForUser(userId: number): Promise<SmsLog[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
