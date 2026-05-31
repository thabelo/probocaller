import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScreeningService } from './screening.service';
import { CallScreening } from './call-screening.entity';
import { TranscriptionProvider } from './transcription.provider';

/**
 * AI Assistant — screening decision engine (Cycle 1).
 *
 * Decides what the assistant does with an incoming call based on who's calling
 * and the Scam Shield risk:
 *   - accept   → ring through (trusted: a contact or verified business)
 *   - reject   → auto-decline (high scam risk)
 *   - screen   → assistant answers, transcribes, lets the user decide
 */
describe('ScreeningService.decideScreeningAction', () => {
  const service = new ScreeningService({} as any, {} as any);

  it('accepts a known contact', () => {
    expect(service.decideScreeningAction({ isContact: true, scamLevel: 'medium' })).toBe('accept');
  });

  it('accepts a verified business', () => {
    expect(service.decideScreeningAction({ verifiedBusiness: true })).toBe('accept');
  });

  it('rejects a high-risk caller that is not trusted', () => {
    expect(service.decideScreeningAction({ scamLevel: 'high' })).toBe('reject');
  });

  it('screens an unknown low-risk caller', () => {
    expect(service.decideScreeningAction({ scamLevel: 'low' })).toBe('screen');
  });

  it('screens an unknown caller with no signals', () => {
    expect(service.decideScreeningAction({})).toBe('screen');
  });

  it('trust beats risk: a high-risk contact is still accepted', () => {
    expect(service.decideScreeningAction({ isContact: true, scamLevel: 'high' })).toBe('accept');
  });
});

/**
 * AI Assistant — record a screening outcome (Cycle 2).
 *
 * On a 'screen' decision the assistant transcribes the exchange and persists
 * the transcript + summary; accept/reject are recorded without one.
 */
describe('ScreeningService.recordScreening', () => {
  let service: ScreeningService;
  let repo: any;
  let transcriber: { transcribe: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((d: any) => ({ ...d })),
      save: jest.fn(async (x: any) => ({ id: 1, createdAt: new Date(), ...x })),
      find: jest.fn(async () => []),
    };
    transcriber = {
      transcribe: jest.fn(async (ref: string) => ({ transcript: `T:${ref}`, summary: 'S' })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScreeningService,
        { provide: getRepositoryToken(CallScreening), useValue: repo },
        { provide: TranscriptionProvider, useValue: transcriber },
      ],
    }).compile();
    service = module.get(ScreeningService);
  });

  it("transcribes and persists when the action is 'screen'", async () => {
    const row = await service.recordScreening(7, '+27820000001', { scamLevel: 'low' }, 'audio-123');
    expect(transcriber.transcribe).toHaveBeenCalledWith('audio-123');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(row.action).toBe('screen');
    expect(row.transcript).toBe('T:audio-123');
    expect(row.summary).toBe('S');
    expect(row.userId).toBe(7);
    expect(row.callerNumber).toBe('+27820000001');
  });

  it('does not transcribe when the action is accept/reject', async () => {
    const row = await service.recordScreening(7, '+27820000099', { scamLevel: 'high' });
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(row.action).toBe('reject');
    expect(row.transcript).toBeNull();
  });

  it('getHistory returns the user rows newest-first', async () => {
    await service.getHistory(7);
    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 7 },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  });
});
