import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GeneratedPodcastScript, PodcastTurn } from './podcast-generation.types';
import { TtsAnchorMap, TtsService } from './tts.service';
import { PodcastVoiceSettings } from './podcast-management.types';

export interface AudioProductionProgress {
  completedChunks: number;
  totalChunks: number;
}

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

@Injectable()
export class AudioProductionService {
  private readonly ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
  private readonly gapSeconds = Number(process.env.PODCAST_CHUNK_GAP_SECONDS ?? 0.25);
  private readonly bitrate = process.env.PODCAST_MP3_BITRATE ?? '192k';
  private readonly chunkChars = this.positiveNumber(process.env.PODCAST_TTS_CHUNK_CHARS, 600);
  private readonly tempRoot = process.env.PODCAST_AUDIO_TEMP_DIR ?? tmpdir();
  private readonly staleWorkspaceMs = Number(
    process.env.PODCAST_AUDIO_TEMP_MAX_AGE_MS ?? 6 * 60 * 60 * 1000,
  );

  constructor(@Inject(TtsService) private readonly tts: TtsService) {}

  buildChunks(turns: PodcastTurn[], maxChars = this.chunkChars): PodcastTurn[][] {
    if (!Number.isFinite(maxChars) || maxChars < 32) {
      throw new Error('Podcast TTS chunk size must be at least 32 characters');
    }

    const chunks: PodcastTurn[][] = [];
    let current: PodcastTurn[] = [];
    let currentChars = 0;

    for (const original of turns) {
      for (const turn of this.splitOversizedTurn(original, maxChars)) {
        const lineChars = this.formatTurn(turn).length;
        const nextChars = currentChars + (current.length > 0 ? 1 : 0) + lineChars;
        if (current.length > 0 && nextChars > maxChars) {
          chunks.push(current);
          current = [];
          currentChars = 0;
        }
        current.push(turn);
        currentChars += (current.length > 1 ? 1 : 0) + lineChars;
      }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  async produce(
    script: GeneratedPodcastScript,
    onProgress?: (progress: AudioProductionProgress) => void | Promise<void>,
    voiceSettings?: PodcastVoiceSettings,
  ): Promise<Buffer> {
    await mkdir(this.tempRoot, { recursive: true });
    await this.cleanupStaleWorkspaces();
    const workspace = await mkdtemp(path.join(this.tempRoot, 'kiwi-podcast-audio-'));
    try {
      const chunks = this.buildChunks(script.turns);
      if (chunks.length === 0) throw new Error('Podcast script has no audio chunks');

      const runId = randomUUID().replace(/-/g, '').slice(0, 12);
      const anchors: TtsAnchorMap = {
        SPEAKER0: `host-${runId}`,
        SPEAKER1: `guest-${runId}`,
      };

      const hostAnchor = voiceSettings
        ? await this.tts.buildAnchor('HOST_A', anchors.SPEAKER0, voiceSettings)
        : await this.tts.buildAnchor('HOST_A', anchors.SPEAKER0);
      this.validateWav(hostAnchor, 'HOST_A voice anchor');
      const guestAnchor = voiceSettings
        ? await this.tts.buildAnchor('HOST_B', anchors.SPEAKER1, voiceSettings)
        : await this.tts.buildAnchor('HOST_B', anchors.SPEAKER1);
      this.validateWav(guestAnchor, 'HOST_B voice anchor');

      const chunkPaths: string[] = [];
      let expectedFormat: WavFormat | undefined;
      for (const [index, chunk] of chunks.entries()) {
        const wav = voiceSettings
          ? await this.tts.synthesizeChunk(chunk, anchors, voiceSettings)
          : await this.tts.synthesizeChunk(chunk, anchors);
        const format = this.validateWav(wav, `chunk ${index + 1}`);
        if (expectedFormat) this.assertCompatibleFormat(expectedFormat, format, index);
        else expectedFormat = format;

        const chunkPath = path.join(workspace, `chunk-${this.pad(index)}.wav`);
        await writeFile(chunkPath, wav);
        chunkPaths.push(chunkPath);
        await onProgress?.({ completedChunks: index + 1, totalChunks: chunks.length });
      }

      if (!expectedFormat) throw new Error('TTS did not return any podcast audio');
      const concatInputs = [...chunkPaths];
      if (chunkPaths.length > 1 && this.gapSeconds > 0) {
        const silencePath = path.join(workspace, 'silence.wav');
        await this.runFfmpeg([
          '-y',
          '-f', 'lavfi',
          '-i', `anullsrc=r=${expectedFormat.sampleRate}:cl=${this.channelLayout(expectedFormat.channels)}`,
          '-t', String(this.gapSeconds),
          '-c:a', 'pcm_s16le',
          silencePath,
        ]);
        concatInputs.splice(
          0,
          concatInputs.length,
          ...chunkPaths.flatMap((chunkPath, index) =>
            index < chunkPaths.length - 1 ? [chunkPath, silencePath] : [chunkPath],
          ),
        );
      }

      const concatPath = path.join(workspace, 'concat.txt');
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
        '-ar', String(expectedFormat.sampleRate),
        '-ac', String(expectedFormat.channels),
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
        '-ac', String(expectedFormat.channels),
        mp3Path,
      ]);
      const mp3 = await readFile(mp3Path);
      if (mp3.length === 0) throw new Error('FFmpeg produced an empty MP3');
      return mp3;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private splitOversizedTurn(turn: PodcastTurn, maxChars: number): PodcastTurn[] {
    const clean = { ...turn, text: turn.text.trim() };
    if (!clean.text) return [];
    const maxTextChars = maxChars - this.formatTurn({ ...clean, text: '' }).length;
    if (clean.text.length <= maxTextChars) return [clean];

    const sentences = clean.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((text) => text.trim()) ?? [];
    const pieces: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (sentence.length > maxTextChars) {
        if (current) pieces.push(current);
        current = '';
        pieces.push(...this.splitText(sentence, maxTextChars));
      } else if (!current) {
        current = sentence;
      } else if (`${current} ${sentence}`.length <= maxTextChars) {
        current = `${current} ${sentence}`;
      } else {
        pieces.push(current);
        current = sentence;
      }
    }
    if (current) pieces.push(current);
    return pieces.filter(Boolean).map((text) => ({ speaker: turn.speaker, text }));
  }

  private splitText(text: string, maxChars: number): string[] {
    const pieces: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      if (word.length > maxChars) {
        if (current) pieces.push(current);
        current = '';
        for (let offset = 0; offset < word.length; offset += maxChars) {
          pieces.push(word.slice(offset, offset + maxChars));
        }
      } else if (!current) {
        current = word;
      } else if (`${current} ${word}`.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        pieces.push(current);
        current = word;
      }
    }
    if (current) pieces.push(current);
    return pieces;
  }

  private formatTurn(turn: PodcastTurn): string {
    const tag = turn.speaker === 'HOST_A' ? 'SPEAKER0' : 'SPEAKER1';
    return `[${tag}] ${turn.text.trim()}`;
  }

  private validateWav(wav: Buffer, label: string): WavFormat {
    if (
      wav.length < 44 ||
      wav.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      wav.subarray(8, 12).toString('ascii') !== 'WAVE'
    ) {
      throw new Error(`TTS returned an invalid WAV for ${label}`);
    }

    let format: WavFormat | undefined;
    let hasAudio = false;
    for (let offset = 12; offset + 8 <= wav.length; ) {
      const id = wav.subarray(offset, offset + 4).toString('ascii');
      const size = wav.readUInt32LE(offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > wav.length) throw new Error(`TTS returned a truncated WAV for ${label}`);
      if (id === 'fmt ' && size >= 16) {
        format = {
          audioFormat: wav.readUInt16LE(start),
          channels: wav.readUInt16LE(start + 2),
          sampleRate: wav.readUInt32LE(start + 4),
          bitsPerSample: wav.readUInt16LE(start + 14),
        };
      }
      if (id === 'data' && size > 0) hasAudio = true;
      offset = end + (size % 2);
    }

    if (!format || !hasAudio) throw new Error(`TTS returned an empty or malformed WAV for ${label}`);
    if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
      throw new Error(`TTS returned unsupported WAV encoding for ${label}`);
    }
    if (format.channels < 1 || format.channels > 2 || format.sampleRate < 8000) {
      throw new Error(`TTS returned unsupported WAV settings for ${label}`);
    }
    return format;
  }

  private assertCompatibleFormat(expected: WavFormat, actual: WavFormat, index: number) {
    if (
      expected.audioFormat !== actual.audioFormat ||
      expected.channels !== actual.channels ||
      expected.sampleRate !== actual.sampleRate ||
      expected.bitsPerSample !== actual.bitsPerSample
    ) {
      throw new Error(`TTS returned incompatible WAV settings for chunk ${index + 1}`);
    }
  }

  private channelLayout(channels: number): string {
    if (channels === 1) return 'mono';
    if (channels === 2) return 'stereo';
    throw new Error(`Unsupported TTS channel count: ${channels}`);
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

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private pad(index: number) {
    return String(index).padStart(4, '0');
  }
}
