import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhitelistedNumber } from './business-whitelist.entity';
import { CreateWhitelistedNumberDto } from './dto/create-whitelisted-number.dto';
import { UpdateWhitelistedNumberDto } from './dto/update-whitelisted-number.dto';
import { normalizeNumber } from '../suppression/number-hash';

@Injectable()
export class BusinessWhitelistService {
  constructor(
    @InjectRepository(WhitelistedNumber)
    private readonly repo: Repository<WhitelistedNumber>,
  ) {}

  private async assertNoDuplicate(phoneNumber: string, excludeId?: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { phoneNumber } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('This phone number is already whitelisted');
    }
  }

  async create(dto: CreateWhitelistedNumberDto): Promise<WhitelistedNumber> {
    const normalized = normalizeNumber(dto.phoneNumber);
    await this.assertNoDuplicate(normalized);
    const w = this.repo.create({ phoneNumber: normalized, label: dto.label, active: true });
    return this.repo.save(w);
  }

  findAll(): Promise<WhitelistedNumber[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: number, data: UpdateWhitelistedNumberDto): Promise<WhitelistedNumber> {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Whitelisted number not found');

    if (data.phoneNumber !== undefined) {
      const normalized = normalizeNumber(data.phoneNumber);
      await this.assertNoDuplicate(normalized, id);
      w.phoneNumber = normalized;
    }
    if (data.label !== undefined) {
      w.label = data.label;
    }
    if (data.active !== undefined) {
      w.active = data.active;
    }
    return this.repo.save(w);
  }

  async remove(id: number): Promise<void> {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Whitelisted number not found');
    await this.repo.remove(w);
  }

  async getActiveNumbers(): Promise<string[]> {
    const rows = await this.repo.find({ where: { active: true } });
    return rows.map((r) => normalizeNumber(r.phoneNumber));
  }
}
