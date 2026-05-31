import { Injectable } from '@nestjs/common';
import { LookupService } from '../lookup/lookup.service';

export interface ScamSignals {
  globalSpam?: boolean;
  communityReports?: number;
  verifiedBusiness?: boolean;
  registered?: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ScamRisk {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface ScamAssessment extends ScamRisk {
  phoneNumber: string;
  status: string;
}

// Each community spam report adds this much risk.
const PER_REPORT_WEIGHT = 18;
// An unknown (unregistered) caller carries mild baseline risk.
const UNREGISTERED_WEIGHT = 15;
const HIGH_THRESHOLD = 70;
const MEDIUM_THRESHOLD = 35;

@Injectable()
export class ScamShieldService {
  constructor(private readonly lookupService: LookupService) {}

  /**
   * Assess a phone number in real time: pull its live crowd signals from the
   * lookup service and score them. Used to warn the user before they answer.
   */
  async assess(rawPhone: string): Promise<ScamAssessment> {
    const result = await this.lookupService.lookup(rawPhone);
    const risk = this.scoreScamRisk({
      globalSpam: result.flags.globalSpam,
      communityReports: result.flags.userReports,
      verifiedBusiness: result.business?.verified === true,
      registered: result.found,
    });
    return { phoneNumber: result.phoneNumber, status: result.status, ...risk };
  }

  /**
   * Combine crowd signals into a 0–100 scam risk score with a level and
   * reasons. A verified business short-circuits to zero risk; a globally
   * flagged spammer is maxed out; otherwise risk accrues from community
   * reports and from the caller being unknown to the network.
   */
  scoreScamRisk(signals: ScamSignals): ScamRisk {
    if (signals.verifiedBusiness) {
      return { score: 0, level: 'low', reasons: ['Verified business'] };
    }

    const reasons: string[] = [];
    let score = 0;

    if (signals.globalSpam) {
      score = 100;
      reasons.push('Marked as spam globally');
    } else {
      const reports = signals.communityReports ?? 0;
      if (reports > 0) {
        score += reports * PER_REPORT_WEIGHT;
        reasons.push(`${reports} community spam report(s)`);
      }
      if (signals.registered === false) {
        score += UNREGISTERED_WEIGHT;
        reasons.push('Caller not registered on Probo');
      }
    }

    score = Math.min(100, score);
    const level: RiskLevel =
      score >= HIGH_THRESHOLD ? 'high' : score >= MEDIUM_THRESHOLD ? 'medium' : 'low';
    return { score, level, reasons };
  }
}
