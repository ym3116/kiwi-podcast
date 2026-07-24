import { Inject, Injectable } from '@nestjs/common';
import { PodcastEpisode } from '../types/podcast';
import { PodcastChunkSourceService } from './podcast-chunk-source.service';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { GeneratePodcastResult, PodcastJob } from './podcast-generation.types';
import { ScriptGeneratorService } from './script-generator.service';
import { AudioProductionService } from './audio-production.service';

@Injectable()
export class PodcastGenerationService {
  constructor(
    @Inject(PodcastChunkSourceService) private readonly chunkSource: PodcastChunkSourceService,
    @Inject(PodcastArtifactStore) private readonly artifacts: PodcastArtifactStore,
    @Inject(ScriptGeneratorService) private readonly scripts: ScriptGeneratorService,
    @Inject(AudioProductionService) private readonly audioProduction: AudioProductionService,
  ) {}

  async generate(
    classId: string,
    documentId: string,
    accessToken: string,
  ): Promise<GeneratePodcastResult> {
    const episodeId = this.episodeId(documentId);
    const existing = await this.artifacts.readJob(classId, episodeId);
    if (existing?.status === 'ready') {
      return { job: existing, episode: await this.episodeFromJob(existing) };
    }

    const started = await this.artifacts.beginJob(episodeId, {
      classId,
      documentId,
    });
    if (!started.started) {
      return { job: started.job, episode: await this.episodeFromJob(started.job) };
    }

    try {
      const chunks = await this.chunkSource.getChunks(classId, documentId, accessToken);
      const script = await this.scripts.generate(chunks);
      const { scriptPath } = await this.artifacts.writeScript(episodeId, script);
      const audio = await this.audioProduction.produce(script);
      const { storageKey } = await this.artifacts.writeAudio(episodeId, audio);
      const generatedAt = new Date().toISOString();

      const job = await this.artifacts.markJob(episodeId, {
        classId,
        documentId,
        status: 'ready',
        scriptPath,
        audioStorageKey: storageKey,
        audioUrl: this.audioUrl(classId, episodeId),
        generatedAt,
      });

      return { job, episode: await this.episodeFromJob(job) };
    } catch (error) {
      const job = await this.artifacts.markJob(episodeId, {
        classId,
        documentId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { job };
    }
  }

  async getStatus(classId: string, documentId: string): Promise<PodcastJob> {
    const episodeId = this.episodeId(documentId);
    const job = await this.artifacts.readJob(classId, episodeId);
    if (job) return job;

    return {
      episodeId,
      classId,
      documentId,
      status: 'placeholder',
      updatedAt: new Date().toISOString(),
    };
  }

  async syncPodcastCatalog(response: import('../types/podcast').PodcastResponse): Promise<void> {
    await this.artifacts.syncCatalog(response);
  }

  async overlayEpisode(classId: string, episode: PodcastEpisode): Promise<PodcastEpisode> {
    const [job, titleOverride] = await Promise.all([
      this.artifacts.readPublishedJob(classId, episode.id),
      this.artifacts.titleOverride(classId, episode.id),
    ]);
    if (!job) {
      return {
        ...episode,
        title: titleOverride || episode.title,
        status: 'placeholder',
        script: '',
        audioUrl: undefined,
        generatedAt: undefined,
        errorMessage: undefined,
      };
    }

    const generated = await this.episodeFromJob(job);
    if (!generated) {
      return {
        ...episode,
        title: titleOverride || episode.title,
        status: job.status,
        audioUrl: job.audioUrl,
        generatedAt: job.generatedAt,
        errorMessage: job.errorMessage,
      };
    }

    return {
      ...episode,
      title: titleOverride || generated.title,
      durationLabel: generated.durationLabel,
      script: generated.script,
      status: generated.status,
      audioUrl: generated.audioUrl,
      generatedAt: generated.generatedAt,
      errorMessage: generated.errorMessage,
    };
  }

  getAudioStorageKey(classId: string, episodeId: string): Promise<string | null> {
    return this.artifacts.audioStorageKey(classId, episodeId);
  }

  private async episodeFromJob(job: PodcastJob): Promise<PodcastEpisode | undefined> {
    const script = job.id
      ? await this.artifacts.readScriptForJob(job.id)
      : await this.artifacts.readScript(job.episodeId);
    if (!script) return undefined;

    return {
      id: job.episodeId,
      documentId: job.documentId,
      title: script?.title ?? `Podcast episode for ${job.documentId}`,
      lectureNumber: 0,
      documentName: job.documentId,
      materialType: 'document',
      durationLabel: this.durationLabel(job.durationSeconds),
      script: script.turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n\n'),
      status: job.status,
      audioUrl: job.audioUrl,
      generatedAt: job.generatedAt,
      errorMessage: job.errorMessage,
    };
  }

  private episodeId(documentId: string): string {
    return `episode-${documentId}`;
  }

  private audioUrl(classId: string, episodeId: string): string {
    const base = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(
      /\/$/,
      '',
    );
    return `${base}/api/podcast/classes/${encodeURIComponent(classId)}/audio/${encodeURIComponent(episodeId)}`;
  }

  private durationLabel(durationSeconds?: number): string {
    if (!durationSeconds || !Number.isFinite(durationSeconds)) return 'Published';
    const seconds = Math.max(0, Math.floor(durationSeconds));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
