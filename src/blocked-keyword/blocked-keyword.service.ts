import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockedKeyword } from './blocked-keyword.entity';

@Injectable()
export class BlockedKeywordService {
  constructor(
    @InjectRepository(BlockedKeyword)
    private readonly repo: Repository<BlockedKeyword>,
  ) {}

  getAll(userId: number): Promise<BlockedKeyword[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async add(userId: number, data: { keyword: string; scope?: string; note?: string }): Promise<BlockedKeyword> {
    const normalized = data.keyword.trim();
    if (!normalized) throw new ConflictException('Keyword cannot be empty');
    const existing = await this.repo.findOne({ where: { userId, keyword: normalized } });
    if (existing) throw new ConflictException('You already have this keyword blocked');
    const kw = this.repo.create({ userId, keyword: normalized, scope: data.scope ?? 'both', note: data.note, active: true });
    return this.repo.save(kw);
  }

  async toggle(userId: number, id: number): Promise<BlockedKeyword> {
    const kw = await this.repo.findOne({ where: { id, userId } });
    if (!kw) throw new NotFoundException('Keyword not found');
    kw.active = !kw.active;
    return this.repo.save(kw);
  }

  async remove(userId: number, id: number): Promise<void> {
    const kw = await this.repo.findOne({ where: { id, userId } });
    if (!kw) throw new NotFoundException('Keyword not found');
    await this.repo.remove(kw);
  }

  async getActiveKeywords(userId: number, scope: 'sms' | 'call'): Promise<string[]> {
    const all = await this.repo.find({ where: { userId, active: true } });
    return all.filter(k => k.scope === 'both' || k.scope === scope).map(k => k.keyword);
  }
}
