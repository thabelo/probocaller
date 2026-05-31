import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneReport } from './phone-report.entity';
import { PhoneReportVote } from './phone-report-vote.entity';

export interface ReportPhoneDto {
  phone: string;         // E.164: +27123456789
  country?: string;      // za
  code?: string;         // 27
  phoneLocal?: string;   // 0123456789
  isGlobalSpam?: boolean;
  reporterPhone?: string; // the reporter's own phone number
  reason?: string;        // spam | scam | robocall | harassment | debt | other
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(PhoneReport)
    private readonly repo: Repository<PhoneReport>,
    @InjectRepository(PhoneReportVote)
    private readonly voteRepo: Repository<PhoneReportVote>,
  ) {}

  private calcRiskScore(spamReports: number, isSpam: boolean, trustedBusiness: boolean): number {
    let score = Math.min(80, spamReports * 8);
    if (isSpam) score = Math.min(100, score + 20);
    if (trustedBusiness) score = Math.max(0, score - 10);
    return Math.round(score);
  }

  async submitReport(dto: ReportPhoneDto): Promise<PhoneReport> {
    const isSuspectedBusiness = dto.reason === 'suspected_business';

    // Deduplicate: one reporter can only count once per (reportedPhone, reason kind).
    // We allow a user who previously flagged spam to ALSO flag suspected-business later
    // and vice-versa, since they're different signals.
    if (dto.reporterPhone) {
      const existing = await this.voteRepo.findOne({
        where: { reporterPhone: dto.reporterPhone, reportedPhone: dto.phone, reason: dto.reason },
      });
      // For non-suspected-business reports, also block if any prior spam-style vote exists
      // (preserves pre-existing dedup behaviour for the spam reporting flow).
      if (!isSuspectedBusiness) {
        const anyPrior = await this.voteRepo.findOne({
          where: { reporterPhone: dto.reporterPhone, reportedPhone: dto.phone },
        });
        if (anyPrior && anyPrior.reason !== 'suspected_business') {
          throw new ConflictException('You have already reported this number');
        }
      } else if (existing) {
        throw new ConflictException('You have already flagged this number as a suspected business');
      }

      await this.voteRepo.save(
        this.voteRepo.create({ reporterPhone: dto.reporterPhone, reportedPhone: dto.phone, reason: dto.reason }),
      );
    }

    let record = await this.repo.findOne({ where: { phone: dto.phone } });

    if (!record) {
      record = this.repo.create({
        phone: dto.phone,
        country: dto.country ?? null,
        code: dto.code ?? null,
        phoneLocal: dto.phoneLocal ?? null,
        spamReports: 0,
        suspectedBusinessReports: 0,
        trustedBusiness: false,
      });
    }

    if (dto.country) record.country = dto.country;
    if (dto.code) record.code = dto.code;
    if (dto.phoneLocal) record.phoneLocal = dto.phoneLocal;

    if (isSuspectedBusiness) {
      record.suspectedBusinessReports = (record.suspectedBusinessReports ?? 0) + 1;
    } else {
      record.spamReports += 1;
      record.lastComplaint = new Date().toISOString().slice(0, 10);
      if (dto.reason) record.lastReason = dto.reason;
    }

    record.riskScore = this.calcRiskScore(
      record.spamReports,
      dto.isGlobalSpam ?? false,
      record.trustedBusiness,
    );

    return this.repo.save(record);
  }

  async getReport(phone: string): Promise<PhoneReport | null> {
    return this.repo.findOne({ where: { phone } }) ?? null;
  }

  async setTrustedBusiness(phone: string, trusted: boolean): Promise<PhoneReport | null> {
    const record = await this.repo.findOne({ where: { phone } });
    if (!record) return null;
    record.trustedBusiness = trusted;
    record.riskScore = this.calcRiskScore(record.spamReports, false, trusted);
    return this.repo.save(record);
  }
}
