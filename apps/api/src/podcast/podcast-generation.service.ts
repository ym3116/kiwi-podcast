import { Inject, Injectable } from '@nestjs/common';
import { PodcastEpisode } from '../types/podcast';
import { LocalDemoChunkSource, PodcastChunkSource } from './local-demo-chunk-source';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { GeneratePodcastResult, PodcastJob } from './podcast-generation.types';
import { ScriptGeneratorService } from './script-generator.service';
import { TtsService } from './tts.service';

@Injectable()
export class PodcastGenerationService {
  constructor(
    @Inject(LocalDemoChunkSource) private readonly chunkSource: PodcastChunkSource,
    @Inject(PodcastArtifactStore) private readonly artifacts: PodcastArtifactStore,
    @Inject(ScriptGeneratorService) private readonly scripts: ScriptGeneratorService,
    @Inject(TtsService) private readonly tts: TtsService,
  ) {}

  async generate(classId: string, documentId: string): Promise<GeneratePodcastResult> {
    const episodeId = this.episodeId(documentId);
    const existing = await this.artifacts.readJob(episodeId);
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
      const chunks = await this.chunkSource.getChunks(classId, documentId);
      const script = await this.scripts.generate(chunks);
      const { scriptPath } = await this.artifacts.writeScript(episodeId, script);
      const audio = await this.tts.synthesize(script);
      const { audioPath } = await this.artifacts.writeAudio(episodeId, audio);
      const generatedAt = new Date().toISOString();

      const job = await this.artifacts.markJob(episodeId, {
        classId,
        documentId,
        status: 'ready',
        scriptPath,
        audioPath,
        audioUrl: this.audioUrl(episodeId),
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
    const job = await this.artifacts.readJob(episodeId);
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

  async overlayEpisode(episode: PodcastEpisode): Promise<PodcastEpisode> {
    const job = await this.artifacts.readJob(episode.id);
    if (!job) return episode;

    const generated = await this.episodeFromJob(job);
    if (!generated) {
      return {
        ...episode,
        status: job.status,
        audioUrl: job.audioUrl,
        generatedAt: job.generatedAt,
        errorMessage: job.errorMessage,
      };
    }

    return {
      ...episode,
      title: generated.title,
      durationLabel: generated.durationLabel,
      script: generated.script,
      status: generated.status,
      audioUrl: generated.audioUrl,
      generatedAt: generated.generatedAt,
      errorMessage: generated.errorMessage,
    };
  }

  getAudioPath(episodeId: string): string {
    return this.artifacts.audioPath(episodeId);
  }

  private async episodeFromJob(job: PodcastJob): Promise<PodcastEpisode | undefined> {
    const script = await this.artifacts.readScript(job.episodeId);
    if (!script) return undefined;

    return {
      id: job.episodeId,
      documentId: job.documentId,
      title: script?.title ?? `Podcast episode for ${job.documentId}`,
      lectureNumber: 0,
      documentName: job.documentId,
      materialType: 'document',
      durationLabel: `${script.durationTargetMinutes} min`,
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

  private audioUrl(episodeId: string): string {
    const base = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(
      /\/$/,
      '',
    );
    return `${base}/api/podcast/audio/${encodeURIComponent(episodeId)}`;
  }
}
