import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsInsight, SmsInsightStatus } from './sms-insight.entity';
import { User } from '../user/user.entity';
import { SmsAnalyser, SmsMessage } from './sms-analyser';
import { ProfileService } from '../profile/profile.service';

/** Injection token for the analyser, so an internal LLM can replace the default. */
export const SMS_ANALYSER = Symbol('SMS_ANALYSER');

/**
 * Runs the analyser over a consented user's SMS and stores what it finds as
 * pending SUGGESTIONS. Nothing here changes a profile or a survey — that waits
 * for the user (profile) or an admin (survey) to act.
 *
 * The consent gate is the first thing it does and the whole point: without
 * smsAnalysisConsent the messages are never even passed to the analyser, so the
 * server's hash-only guarantee is only relaxed for a user who asked for it.
 */
@Injectable()
export class SmsInsightService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SmsInsight)
    private readonly insightRepo: Repository<SmsInsight>,
    @Inject(SMS_ANALYSER)
    private readonly analyser: SmsAnalyser,
    private readonly profiles: ProfileService,
  ) {}

  async analyseForUser(userId: number, messages: SmsMessage[]) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    // The gate. Refused BEFORE the messages touch the analyser — an account
    // that has not consented must never have its SMS content read.
    if (!user.smsAnalysisConsent) {
      throw new ForbiddenException('SMS analysis is switched off for this account.');
    }

    const result = this.analyser.analyse(messages ?? []);

    // A fresh pass supersedes stale pending suggestions rather than piling up
    // duplicates; anything already applied or dismissed is left as history.
    await this.insightRepo.delete({ userId, status: 'pending' });

    const rows = [
      ...result.profileSuggestions.map((s) =>
        this.insightRepo.create({
          userId, kind: 'profile_field', fieldKey: s.fieldKey, suggestedValue: s.suggestedValue,
          confidence: String(s.confidence), evidence: s.evidence, status: 'pending',
        }),
      ),
      ...result.surveySuggestions.map((s) =>
        this.insightRepo.create({
          userId, kind: 'survey_question', prompt: s.prompt, questionType: s.type,
          confidence: '0', evidence: s.reason, status: 'pending',
        }),
      ),
    ];
    const saved = rows.length ? await this.insightRepo.save(rows) : [];
    return {
      profile: saved.filter((r) => r.kind === 'profile_field'),
      survey: saved.filter((r) => r.kind === 'survey_question'),
    };
  }

  /** A user's pending PROFILE suggestions, strongest first. */
  pendingProfileFor(userId: number): Promise<SmsInsight[]> {
    return this.insightRepo.find({
      where: { userId, kind: 'profile_field', status: 'pending' },
      order: { confidence: 'DESC', id: 'DESC' },
    });
  }

  /** Every pending SURVEY suggestion, for admin review. */
  pendingSurveySuggestions(): Promise<SmsInsight[]> {
    return this.insightRepo.find({
      where: { kind: 'survey_question', status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Apply a profile suggestion the user accepted.
   *
   * Routed through the ordinary profile update, deliberately: the change lands
   * in the profile change log and clears staleness exactly as if the user had
   * typed it — because they DID choose it, and the history should not hide that
   * a suggestion was the prompt. Merges the one field into the existing data
   * (updateMyProfile replaces the map wholesale, so it must carry the rest).
   */
  async applyProfileSuggestion(userId: number, id: number): Promise<SmsInsight> {
    const insight = await this.insightRepo.findOne({ where: { id } });
    if (!insight) throw new NotFoundException('Suggestion not found');
    if (insight.userId !== userId) {
      throw new ForbiddenException('That suggestion does not belong to your account.');
    }
    if (insight.kind !== 'profile_field' || !insight.fieldKey) {
      throw new ForbiddenException('That suggestion is not a profile field.');
    }

    const profile = await this.profiles.getMyProfile(userId);
    const data = { ...(profile?.data ?? {}), [insight.fieldKey]: insight.suggestedValue };
    await this.profiles.updateMyProfile(userId, { data } as any);

    insight.status = 'applied';
    return this.insightRepo.save(insight);
  }

  /** Mark a suggestion applied or dismissed — only the owner may. */
  async resolve(userId: number, id: number, status: Exclude<SmsInsightStatus, 'pending'>): Promise<SmsInsight> {
    const insight = await this.insightRepo.findOne({ where: { id } });
    if (!insight) throw new NotFoundException('Suggestion not found');
    if (insight.userId !== userId) {
      throw new ForbiddenException('That suggestion does not belong to your account.');
    }
    insight.status = status;
    return this.insightRepo.save(insight);
  }
}
