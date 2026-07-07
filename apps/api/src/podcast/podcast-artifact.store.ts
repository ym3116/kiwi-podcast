import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GeneratedPodcastScript,
  PodcastJob,
  PodcastJobStatus,
} from './podcast-generation.types';

@Injectable()
export class PodcastArtifactStore {
  private readonly root =
    process.env.PODCAST_STORAGE_DIR ?? path.resolve(__dirname, '../../.podcasts');

  async readJob(episodeId: string): Promise<PodcastJob | null> {
    try {
      return JSON.parse(await readFile(this.jobPath(episodeId), 'utf8')) as PodcastJob;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeJob(job: PodcastJob): Promise<PodcastJob> {
    await this.writeJson(this.jobPath(job.episodeId), job);
    return job;
  }

  async markJob(
    episodeId: string,
    patch: Omit<Partial<PodcastJob>, 'episodeId'> & {
      classId: string;
      documentId: string;
      status: PodcastJobStatus;
    },
  ): Promise<PodcastJob> {
    const current = await this.readJob(episodeId);
    return this.writeJob({
      episodeId,
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async writeScript(
    episodeId: string,
    script: GeneratedPodcastScript,
  ): Promise<{ scriptPath: string }> {
    const scriptPath = this.scriptPath(episodeId);
    await this.writeJson(scriptPath, script);
    return { scriptPath };
  }

  async readScript(episodeId: string): Promise<GeneratedPodcastScript | null> {
    try {
      return JSON.parse(await readFile(this.scriptPath(episodeId), 'utf8')) as GeneratedPodcastScript;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeAudio(episodeId: string, audio: Buffer): Promise<{ audioPath: string }> {
    const audioPath = this.audioPath(episodeId);
    await mkdir(path.dirname(audioPath), { recursive: true });
    await writeFile(audioPath, audio);
    return { audioPath };
  }

  audioPath(episodeId: string): string {
    return path.join(this.root, 'audio', `${this.safeId(episodeId)}.mp3`);
  }

  private jobPath(episodeId: string): string {
    return path.join(this.root, 'jobs', `${this.safeId(episodeId)}.json`);
  }

  private scriptPath(episodeId: string): string {
    return path.join(this.root, 'scripts', `${this.safeId(episodeId)}.json`);
  }

  private async writeJson(filePath: string, payload: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  private safeId(id: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      throw new Error('Podcast artifact ID can only contain letters, numbers, dots, underscores, and dashes');
    }
    return id;
  }
}
