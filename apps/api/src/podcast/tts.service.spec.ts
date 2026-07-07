import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtsService } from './tts.service';

describe('TtsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('builds multi-speaker dialogue with Higgs speaker tags', () => {
    const service = new TtsService();

    expect(
      service.buildDialogue({
        title: 'Title',
        summary: 'Summary',
        durationTargetMinutes: 3,
        turns: [
          { speaker: 'HOST_A', text: 'Hello.' },
          { speaker: 'HOST_B', text: 'Welcome.' },
        ],
      }),
    ).toBe('[SPEAKER0] Hello.\n[SPEAKER1] Welcome.');
  });

  it('sends required voice and JSON instructions to the TTS API', async () => {
    process.env.TTS_BASE_URL = 'https://tts.example.test';
    process.env.TTS_API_KEY = 'tts-key';
    process.env.TTS_MODEL = 'higgs-audio-v2';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new TtsService();
    const audio = await service.synthesize({
      title: 'Title',
      summary: 'Summary',
      durationTargetMinutes: 3,
      turns: [{ speaker: 'HOST_A', text: 'Hello.' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tts.example.test/v1/audio/speech',
      expect.any(Object),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'higgs-audio-v2',
      voice: 'alloy',
      response_format: 'mp3',
    });
    expect(JSON.parse(body.instructions).system_prompt).toContain('SPEAKER0');
    expect(audio).toEqual(Buffer.from([1, 2, 3]));
  });
});
