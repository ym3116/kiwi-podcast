import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GeneratedPodcastScript, PodcastTurn } from './podcast-generation.types';
import { TtsService } from './tts.service';

export interface AudioProductionProgress {
  completedSegments: number;
  totalSegments: number;
}

@Injectable()
export class AudioProductionService {
  private readonly ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
  private readonly pauseSeconds = Number(process.env.PODCAST_SPEAKER_PAUSE_SECONDS ?? 0.35);
  private readonly bitrate = process.env.PODCAST_MP3_BITRATE ?? '192k';
  private readonly tempRoot = process.env.PODCAST_AUDIO_TEMP_DIR ?? tmpdir();
  private readonly staleWorkspaceMs = Number(
    process.env.PODCAST_AUDIO_TEMP_MAX_AGE_MS ?? 6 * 60 * 60 * 1000,
  );

  constructor(@Inject(TtsService) private readonly tts: TtsService) {}

  segmentTurns(turns: PodcastTurn[], maxWords = 100): PodcastTurn[] {
    return turns.flatMap((turn) => this.splitTurn(turn, maxWords));
  }

  async produce(
    script: GeneratedPodcastScript,
    onProgress?: (progress: AudioProductionProgress) => void | Promise<void>,
  ): Promise<Buffer> {
    await mkdir(this.tempRoot, { recursive: true });
    await this.cleanupStaleWorkspaces();
    const workspace = await mkdtemp(path.join(this.tempRoot, 'kiwi-podcast-audio-'));
    try {
      const segments = this.segmentTurns(script.turns);
      if (segments.length === 0) throw new Error('Podcast script has no audio segments');

      const normalizedPaths: string[] = [];
      for (const [index, segment] of segments.entries()) {
        const rawPath = path.join(workspace, `segment-${this.pad(index)}-raw.wav`);
        const normalizedPath = path.join(workspace, `segment-${this.pad(index)}.wav`);
        const wav = await this.tts.synthesizeSegment(segment);
        this.validateWav(wav, index);
        await writeFile(rawPath, wav);
        await this.runFfmpeg([
          '-y',
          '-i', rawPath,
          '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
          '-ar', '44100',
          '-ac', '1',
          '-c:a', 'pcm_s16le',
          normalizedPath,
        ]);
        normalizedPaths.push(normalizedPath);
        await onProgress?.({ completedSegments: index + 1, totalSegments: segments.length });
      }

      const silencePath = path.join(workspace, 'silence.wav');
      await this.runFfmpeg([
        '-y',
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=mono',
        '-t', String(this.pauseSeconds),
        '-c:a', 'pcm_s16le',
        silencePath,
      ]);

      const concatPath = path.join(workspace, 'concat.txt');
      const concatInputs = normalizedPaths.flatMap((segmentPath, index) =>
        index < normalizedPaths.length - 1 && segments[index + 1].speaker !== segments[index].speaker
          ? [segmentPath, silencePath]
          : [segmentPath],
      );
      await writeFile(
        concatPath,
        concatInputs.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'),
        'utf8',
      );

      const masterPath = path.join(workspace, 'master.wav');
      await this.runFfmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '44100',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        masterPath,
      ]);

      const mp3Path = path.join(workspace, 'podcast.mp3');
      await this.runFfmpeg([
        '-y',
        '-i', masterPath,
        '-c:a', 'libmp3lame',
        '-b:a', this.bitrate,
        '-ar', '44100',
        '-ac', '1',
        mp3Path,
      ]);
      const mp3 = await readFile(mp3Path);
      if (mp3.length === 0) throw new Error('FFmpeg produced an empty MP3');
      return mp3;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private splitTurn(turn: PodcastTurn, maxWords: number): PodcastTurn[] {
    const words = turn.text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return [{ ...turn, text: turn.text.trim() }];

    const sentences = turn.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((text) => text.trim()) ?? [];
    const chunks: string[] = [];
    let current: string[] = [];
    let currentWords = 0;
    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).filter(Boolean);
      if (currentWords > 0 && currentWords + sentenceWords.length > maxWords) {
        chunks.push(current.join(' '));
        current = [];
        currentWords = 0;
      }
      if (sentenceWords.length > maxWords) {
        for (let offset = 0; offset < sentenceWords.length; offset += maxWords) {
          if (current.length) {
            chunks.push(current.join(' '));
            current = [];
            currentWords = 0;
          }
          chunks.push(sentenceWords.slice(offset, offset + maxWords).join(' '));
        }
      } else {
        current.push(sentence);
        currentWords += sentenceWords.length;
      }
    }
    if (current.length) chunks.push(current.join(' '));
    return chunks.filter(Boolean).map((text) => ({ speaker: turn.speaker, text }));
  }

  private validateWav(wav: Buffer, index: number) {
    if (
      wav.length < 44 ||
      wav.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      wav.subarray(8, 12).toString('ascii') !== 'WAVE'
    ) {
      throw new Error(`TTS returned an invalid WAV for segment ${index + 1}`);
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      process.stderr.setEncoding('utf8');
      process.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-8000);
      });
      process.once('error', (error) => {
        reject(new Error(`Unable to start FFmpeg at ${this.ffmpegPath}: ${error.message}`));
      });
      process.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg failed with code ${code}: ${stderr.trim()}`));
      });
    });
  }

  private async cleanupStaleWorkspaces() {
    const entries = await readdir(this.tempRoot, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('kiwi-podcast-audio-'))
        .map(async (entry) => {
          const workspace = path.join(this.tempRoot, entry.name);
          const metadata = await stat(workspace);
          if (now - metadata.mtimeMs > this.staleWorkspaceMs) {
            await rm(workspace, { recursive: true, force: true });
          }
        }),
    );
  }

  private pad(index: number) {
    return String(index).padStart(4, '0');
  }
}
