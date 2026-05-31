import { OpenAiTranscriptionProvider } from './openai-transcription.provider';

/**
 * Real STT/LLM provider for the AI assistant: OpenAI Whisper (transcription) +
 * a chat-completion summary. HTTP is injected so the orchestration is testable
 * without hitting the network.
 */
describe('OpenAiTranscriptionProvider', () => {
  it('throws when no API key is configured', async () => {
    const provider = new OpenAiTranscriptionProvider(jest.fn() as any, '');
    await expect(provider.transcribe('https://x/audio.m4a')).rejects.toThrow();
  });

  it('fetches audio, transcribes via Whisper and summarises via chat', async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) // audio
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'hi this is your delivery' }) }) // whisper
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'Delivery driver at the gate.' } }] }) }); // summary

    const provider = new OpenAiTranscriptionProvider(fetchFn as any, 'sk-test');
    const res = await provider.transcribe('https://x/audio.m4a');

    expect(res.transcript).toBe('hi this is your delivery');
    expect(res.summary).toBe('Delivery driver at the gate.');

    const whisperCall = fetchFn.mock.calls.find((c: any[]) => String(c[0]).includes('/audio/transcriptions'));
    expect(whisperCall).toBeTruthy();
    expect(whisperCall[1].headers.Authorization).toBe('Bearer sk-test');

    const chatCall = fetchFn.mock.calls.find((c: any[]) => String(c[0]).includes('/chat/completions'));
    expect(chatCall).toBeTruthy();
    expect(chatCall[1].headers.Authorization).toBe('Bearer sk-test');
  });

  it('throws if Whisper returns a non-ok response (so the caller can fall back)', async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    const provider = new OpenAiTranscriptionProvider(fetchFn as any, 'sk-bad');
    await expect(provider.transcribe('https://x/audio.m4a')).rejects.toThrow();
  });
});
