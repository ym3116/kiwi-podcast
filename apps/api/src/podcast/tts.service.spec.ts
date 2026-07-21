import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtsService } from './tts.service';

describe('TtsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('builds a preset voice anchor through the instructions JSON channel', async () => {
    process.env.TTS_BASE_URL = 'https://tts.example.test';
    process.env.TTS_API_KEY = 'tts-key';
    process.env.TTS_MODEL = 'higgs-audio-v2';
    process.env.TTS_HOST_A_VOICE = 'nova';
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);

    const service = new TtsService();
    await service.buildAnchor('HOST_A', 'host-run123');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tts.example.test/v1/audio/speech',
      expect.any(Object),
    );
    const body = requestBody(fetchMock);
    expect(body).toMatchObject({
      model: 'higgs-audio-v2',
      voice: 'nova',
      response_format: 'wav',
    });
    expect(body.input).toContain('excited');
    expect(JSON.parse(body.instructions)).toEqual({
      mode: 'build_anchor',
      anchor: 'host-run123',
      voice: 'nova',
      temperature: 0.5,
    });
  });

  it('sends an ordered multi-speaker chunk using the existing anchors', async () => {
    process.env.TTS_BASE_URL = 'https://tts.example.test/v1';
    process.env.TTS_API_KEY = 'tts-key';
    process.env.TTS_MULTI_SEED = '2468';
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const service = new TtsService();

    await service.synthesizeChunk(
      [
        { speaker: 'HOST_A', text: 'Welcome back.' },
        { speaker: 'HOST_B', text: 'Glad to be here.' },
      ],
      { SPEAKER0: 'host-run123', SPEAKER1: 'guest-run123' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tts.example.test/v1/audio/speech',
      expect.any(Object),
    );
    const body = requestBody(fetchMock);
    expect(body.input).toBe(
      '[SPEAKER0] Welcome back.\n[SPEAKER1] Glad to be here.',
    );
    const instructions = JSON.parse(body.instructions);
    expect(instructions).toMatchObject({
      mode: 'multi',
      speakers: { SPEAKER0: 'host-run123', SPEAKER1: 'guest-run123' },
      seed: 2468,
      temperature: 0.5,
    });
    expect(Object.keys(instructions.speakers)).toEqual(['SPEAKER0', 'SPEAKER1']);
    expect(instructions.ref_texts).toEqual({
      SPEAKER0: expect.any(String),
      SPEAKER1: expect.any(String),
    });
    expect(instructions.system_prompt).toContain('SPEAKER0:');
    expect(instructions.system_prompt).toContain('SPEAKER1:');
  });

  it('surfaces a backend anchor or synthesis error', async () => {
    process.env.TTS_API_KEY = 'tts-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'anchor not found',
    }));

    await expect(
      new TtsService().synthesizeChunk(
        [{ speaker: 'HOST_A', text: 'Hello.' }],
        { SPEAKER0: 'missing-a', SPEAKER1: 'missing-b' },
      ),
    ).rejects.toThrow('anchor not found');
  });
});

function successfulFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}
