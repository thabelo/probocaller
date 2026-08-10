import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ScamKeyword } from './scam-keyword.entity';

@Injectable()
export class ScamKeywordService {
  constructor(
    @InjectRepository(ScamKeyword)
    private readonly repo: Repository<ScamKeyword>,
  ) {}

  private async assertNoDuplicate(keyword: string, excludeId?: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { keyword: ILike(keyword) } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('This keyword already exists');
    }
  }

  async create(keyword: string): Promise<ScamKeyword> {
    const normalized = keyword.trim();
    await this.assertNoDuplicate(normalized);
    const kw = this.repo.create({ keyword: normalized, active: true });
    return this.repo.save(kw);
  }

  findAll(): Promise<ScamKeyword[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: number, data: { keyword?: string; active?: boolean }): Promise<ScamKeyword> {
    const kw = await this.repo.findOne({ where: { id } });
    if (!kw) throw new NotFoundException('Scam keyword not found');

    if (data.keyword !== undefined) {
      const normalized = data.keyword.trim();
      await this.assertNoDuplicate(normalized, id);
      kw.keyword = normalized;
    }
    if (data.active !== undefined) {
      kw.active = data.active;
    }
    return this.repo.save(kw);
  }

  async remove(id: number): Promise<void> {
    const kw = await this.repo.findOne({ where: { id } });
    if (!kw) throw new NotFoundException('Scam keyword not found');
    await this.repo.remove(kw);
  }

  async getActiveKeywords(): Promise<string[]> {
    const rows = await this.repo.find({ where: { active: true } });
    return rows.map((r) => r.keyword);
  }
}
