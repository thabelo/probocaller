import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallScreening, ScreeningAction } from './call-screening.entity';
import { TranscriptionProvider } from './transcription.provider';

export interface ScreeningSignals {
  isContact?: boolean;
  verifiedBusiness?: boolean;
  scamLevel?: 'low' | 'medium' | 'high';
}

@Injectable()
export class ScreeningService {
  constructor(
    @InjectRepository(CallScreening)
    private readonly repo: Repository<CallScreening>,
    private readonly transcriber: TranscriptionProvider,
  ) {}

  /**
   * Decide what the assistant does with an incoming call. Trust (a saved
   * contact or verified business) always rings through; otherwise a high scam
   * score is auto-declined and everyone else is screened by the assistant.
   */
  decideScreeningAction(signals: ScreeningSignals): ScreeningAction {
    if (signals.isContact || signals.verifiedBusiness) return 'accept';
    if (signals.scamLevel === 'high') return 'reject';
    return 'screen';
  }

  /**
   * Decide and record a screening outcome. When the assistant screens the call
   * (and an audio reference is available) it transcribes + summarises via the
   * pluggable provider. Returns the persisted row.
   */
  async recordScreening(
    userId: number,
    callerNumber: string,
    signals: ScreeningSignals,
    audioRef?: string,
  ): Promise<CallScreening> {
    const action = this.decideScreeningAction(signals);
    let transcript: string | null = null;
    let summary: string | null = null;

    if (action === 'screen' && audioRef) {
      const result = await this.transcriber.transcribe(audioRef);
      transcript = result.transcript;
      summary = result.summary;
    }

    const row = this.repo.create({ userId, callerNumber, action, transcript, summary });
    return this.repo.save(row);
  }

  /** Recent screening outcomes for a user, newest first. */
  async getHistory(userId: number): Promise<CallScreening[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 });
  }
}
