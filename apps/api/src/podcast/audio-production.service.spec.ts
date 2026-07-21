import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioProductionService } from './audio-production.service';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const tempRoots: string[] = [];
const originalEnv = { ...process.env };

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  process.env = { ...originalEnv };
});

describe('AudioProductionService', () => {
  it('groups complete turns into ordered multi-speaker chunks', () => {
    const service = new AudioProductionService({} as never);
    const chunks = service.buildChunks(
      [
        { speaker: 'HOST_A', text: 'One two three.' },
        { speaker: 'HOST_B', text: 'Four five six.' },
        { speaker: 'HOST_A', text: 'Seven eight nine.' },
      ],
      55,
    );

    expect(chunks).toEqual([
      [
        { speaker: 'HOST_A', text: 'One two three.' },
        { speaker: 'HOST_B', text: 'Four five six.' },
      ],
      [{ speaker: 'HOST_A', text: 'Seven eight nine.' }],
    ]);
  });

  it('splits only an individually oversized turn and preserves its speaker', () => {
    const service = new AudioProductionService({} as never);
    const chunks = service.buildChunks(
      [{ speaker: 'HOST_A', text: 'One two three four five six seven eight nine ten.' }],
      32,
    );

    expect(chunks.flat()).toHaveLength(3);
    expect(chunks.flat().every((turn) => turn.speaker === 'HOST_A')).toBe(true);
    expect(chunks.flat().map((turn) => turn.text).join(' ')).toBe(
      'One two three four five six seven eight nine ten.',
    );
  });

  it('builds anchors in speaker order and removes temporary files when a chunk is invalid', async () => {
    const root = await testRoot();
    const tts = {
      buildAnchor: vi.fn(async () => silentWav()),
      synthesizeChunk: vi.fn(async () => Buffer.from('not wav')),
    };
    const service = new AudioProductionService(tts as never);

    await expect(service.produce(script())).rejects.toThrow('invalid WAV for chunk 1');
    expect(tts.buildAnchor).toHaveBeenNthCalledWith(1, 'HOST_A', expect.stringMatching(/^host-/));
    expect(tts.buildAnchor).toHaveBeenNthCalledWith(2, 'HOST_B', expect.stringMatching(/^guest-/));
    expect(tts.synthesizeChunk).toHaveBeenCalledWith(
      script().turns,
      expect.objectContaining({
        SPEAKER0: expect.stringMatching(/^host-/),
        SPEAKER1: expect.stringMatching(/^guest-/),
      }),
    );
    expect(await readdir(root)).toEqual([]);
  });

  it.skipIf(!ffmpegAvailable)('assembles multi-speaker WAV chunks and produces one MP3 without temporary files', async () => {
    const root = await testRoot();
    process.env.PODCAST_TTS_CHUNK_CHARS = '32';
    process.env.PODCAST_CHUNK_GAP_SECONDS = '0.01';
    const progress = vi.fn();
    const tts = {
      buildAnchor: vi.fn(async () => silentWav()),
      synthesizeChunk: vi.fn(async () => silentWav()),
    };
    const service = new AudioProductionService(tts as never);
    const mp3 = await service.produce(script(), progress);

    expect(mp3.length).toBeGreaterThan(0);
    expect(tts.buildAnchor).toHaveBeenCalledTimes(2);
    expect(tts.synthesizeChunk).toHaveBeenCalledTimes(2);
    expect(tts.synthesizeChunk).toHaveBeenNthCalledWith(
      1,
      [script().turns[0]],
      expect.objectContaining({ SPEAKER0: expect.any(String), SPEAKER1: expect.any(String) }),
    );
    expect(tts.synthesizeChunk).toHaveBeenNthCalledWith(
      2,
      [script().turns[1]],
      expect.objectContaining({ SPEAKER0: expect.any(String), SPEAKER1: expect.any(String) }),
    );
    expect(progress).toHaveBeenLastCalledWith({ completedChunks: 2, totalChunks: 2 });
    expect(await readdir(root)).toEqual([]);
  });
});

async function testRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'kiwi-audio-test-'));
  tempRoots.push(root);
  process.env.PODCAST_AUDIO_TEMP_DIR = root;
  return root;
}

function script() {
  return {
    title: 'Test',
    summary: 'Test',
    durationTargetMinutes: 1,
    turns: [
      { speaker: 'HOST_A' as const, text: 'Hello.' },
      { speaker: 'HOST_B' as const, text: 'Welcome.' },
    ],
  };
}

function silentWav(): Buffer {
  const sampleRate = 24000;
  const samples = 2400;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}
