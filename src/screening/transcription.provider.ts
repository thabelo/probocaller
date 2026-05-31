import { Injectable } from '@nestjs/common';

export interface TranscriptionResult {
  transcript: string;
  summary: string;
}

/**
 * Pluggable speech-to-text + summarisation provider for the AI assistant.
 * Swap StubTranscriptionProvider for a real STT/LLM integration (e.g. Whisper +
 * an LLM summary) without touching ScreeningService.
 */
export abstract class TranscriptionProvider {
  abstract transcribe(audioRef: string): Promise<TranscriptionResult>;
}

@Injectable()
export class StubTranscriptionProvider extends TranscriptionProvider {
  // Placeholder until a real STT/LLM provider is wired. Deterministic so the
  // screening flow is testable end-to-end without external calls.
  async transcribe(audioRef: string): Promise<TranscriptionResult> {
    return {
      transcript: `[stub transcript for ${audioRef}]`,
      summary: 'Caller screened by assistant (transcription provider not configured).',
    };
  }
}
