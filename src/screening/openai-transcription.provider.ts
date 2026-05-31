import { Injectable } from '@nestjs/common';
import { TranscriptionProvider, TranscriptionResult } from './transcription.provider';

type FetchFn = typeof fetch;

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Real transcription provider: OpenAI Whisper for speech-to-text plus a
 * chat-completion one-line summary. `audioRef` is the URL of the recorded
 * screening audio. HTTP is injected for testability.
 *
 * Errors propagate so ScreeningService can fall back gracefully (e.g. when the
 * key is a placeholder).
 */
@Injectable()
export class OpenAiTranscriptionProvider extends TranscriptionProvider {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly apiKey: string | undefined = process.env.OPENAI_API_KEY,
  ) {
    super();
  }

  async transcribe(audioRef: string): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const audioRes = await this.fetchFn(audioRef);
    if (!audioRes.ok) throw new Error('Failed to fetch call audio');
    const buf = await audioRes.arrayBuffer();

    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('file', new Blob([buf], { type: 'audio/m4a' }), 'call.m4a');

    const tr = await this.fetchFn(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!tr.ok) throw new Error(`Whisper transcription failed (${tr.status})`);
    const { text } = (await tr.json()) as { text: string };

    const sum = await this.fetchFn(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarise this screened phone call in one short sentence for the person who was called.' },
          { role: 'user', content: text },
        ],
      }),
    });
    const sumJson: any = sum.ok ? await sum.json() : null;
    const summary = sumJson?.choices?.[0]?.message?.content?.trim() || 'Caller screened by assistant.';

    return { transcript: text, summary };
  }
}
