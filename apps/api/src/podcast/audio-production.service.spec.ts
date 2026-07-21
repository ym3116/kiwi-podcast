import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioProductionService } from './audio-production.service';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.PODCAST_AUDIO_TEMP_DIR;
});

describe('AudioProductionService', () => {
  it('splits long turns without changing speaker order', () => {
    const service = new AudioProductionService({} as never);
    const segments = service.segmentTurns([
      { speaker: 'HOST_A', text: 'One two three four. Five six seven eight.' },
      { speaker: 'HOST_B', text: 'Reply.' },
    ], 5);
    expect(segments).toEqual([
      { speaker: 'HOST_A', text: 'One two three four.' },
      { speaker: 'HOST_A', text: 'Five six seven eight.' },
      { speaker: 'HOST_B', text: 'Reply.' },
    ]);
  });

  it('removes its temporary workspace when TTS returns invalid WAV data', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kiwi-audio-test-'));
    tempRoots.push(root);
    process.env.PODCAST_AUDIO_TEMP_DIR = root;
    const service = new AudioProductionService({
      synthesizeSegment: vi.fn(async () => Buffer.from('not wav')),
    } as never);

    await expect(
      service.produce({
        title: 'Test',
        summary: 'Test',
        durationTargetMinutes: 1,
        turns: [{ speaker: 'HOST_A', text: 'Hello.' }],
      }),
    ).rejects.toThrow('invalid WAV');
    expect(await readdir(root)).toEqual([]);
  });

  it.skipIf(!ffmpegAvailable)('normalizes WAV segments and produces one MP3 without leaving temporary files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kiwi-audio-test-'));
    tempRoots.push(root);
    process.env.PODCAST_AUDIO_TEMP_DIR = root;
    const progress = vi.fn();
    const service = new AudioProductionService({
      synthesizeSegment: vi.fn(async () => silentWav()),
    } as never);
    const mp3 = await service.produce(
      {
        title: 'Test',
        summary: 'Test',
        durationTargetMinutes: 1,
        turns: [
          { speaker: 'HOST_A', text: 'Hello.' },
          { speaker: 'HOST_B', text: 'Welcome.' },
        ],
      },
      progress,
    );

    expect(mp3.length).toBeGreaterThan(0);
    expect(progress).toHaveBeenLastCalledWith({ completedSegments: 2, totalSegments: 2 });
    expect(await readdir(root)).toEqual([]);
  });
});

function silentWav(): Buffer {
  const sampleRate = 44100;
  const samples = 4410;
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
