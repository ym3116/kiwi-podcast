import { ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AudioStorageService } from '../storage/audio-storage.service';
import { AudioProductionService } from './audio-production.service';
import { PodcastChunkSourceService } from './podcast-chunk-source.service';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { GeneratedPodcastScript, PodcastChunkInput, PodcastTurn } from './podcast-generation.types';
import {
  EpisodeVoiceOverrides,
  PodcastVoiceSettings,
  PRESET_VOICES,
  UpdateManagedEpisodeInput,
  VoiceProfile,
} from './podcast-management.types';
import { PodcastService } from './podcast.service';
import { ScriptGeneratorService } from './script-generator.service';
import { TtsService } from './tts.service';

@Injectable()
export class PodcastManagementService {
  private readonly publicBase = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(/\/$/, '');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PodcastService) private readonly podcasts: PodcastService,
    @Inject(PodcastChunkSourceService) private readonly chunks: PodcastChunkSourceService,
    @Inject(ScriptGeneratorService) private readonly scripts: ScriptGeneratorService,
    @Inject(AudioProductionService) private readonly audioProduction: AudioProductionService,
    @Inject(PodcastArtifactStore) private readonly artifacts: PodcastArtifactStore,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
    @Inject(TtsService) private readonly tts: TtsService,
  ) {}

  async getState(classId: string, accessToken: string) {
    await this.podcasts.getClassPodcast(classId, accessToken);
    const podcastClass = await this.prisma.podcastClass.findUniqueOrThrow({
      where: { classId },
      include: {
        documents: {
          orderBy: { lectureNumber: 'asc' },
          include: {
            episode: {
              include: {
                publishedJob: { include: { script: true, audioAsset: true } },
                jobs: { orderBy: { createdAt: 'desc' }, take: 1, include: { audioAsset: true } },
              },
            },
          },
        },
      },
    });
    const defaults = this.parseSettings(podcastClass.voiceDefaults) ?? this.tts.defaultVoiceSettings();
    return {
      classId,
      className: podcastClass.title.replace(/\s+-\s+Podcast$/, ''),
      defaults,
      episodes: podcastClass.documents.flatMap((document) => {
        const episode = document.episode;
        if (!episode) return [];
        const overrides = this.parseOverrides(episode.voiceOverrides);
        const latest = episode.jobs[0];
        return [{
          documentId: document.kiwiDocumentId,
          documentName: document.documentName,
          materialType: document.materialType,
          title: episode.titleOverride || episode.title,
          draft: {
            summary: episode.draftSummary ?? '',
            turns: this.parseTurns(episode.draftTurns),
            revision: episode.draftRevision,
          },
          voiceOverrides: overrides,
          effectiveVoices: this.resolveSettings(defaults, overrides),
          published: episode.publishedJob ? {
            jobId: episode.publishedJob.id,
            generatedAt: episode.publishedJob.finishedAt?.toISOString() ?? episode.publishedJob.updatedAt.toISOString(),
            durationSeconds: episode.publishedJob.durationSeconds,
            audioUrl: `${this.publicBase}/api/podcast/classes/${encodeURIComponent(classId)}/audio/${encodeURIComponent(episode.episodeId)}?v=${episode.publishedJob.id}`,
          } : null,
          latestRender: latest ? this.jobResponse(latest) : null,
        }];
      }),
    };
  }

  async updateDefaults(classId: string, value: unknown) {
    const settings = this.validateSettings(value);
    const podcastClass = await this.prisma.podcastClass.findUniqueOrThrow({
      where: { classId },
      include: { documents: { include: { episode: true } } },
    });
    const previous = this.parseSettings(podcastClass.voiceDefaults) ?? this.tts.defaultVoiceSettings();
    const affectedEpisodeIds = podcastClass.documents.flatMap((document) => {
      if (!document.episode) return [];
      const overrides = this.parseOverrides(document.episode.voiceOverrides);
      return this.sameJson(
        this.resolveSettings(previous, overrides),
        this.resolveSettings(settings, overrides),
      ) ? [] : [document.episode.id];
    });
    await this.prisma.$transaction([
      this.prisma.podcastClass.update({
        where: { classId },
        data: { voiceDefaults: settings as unknown as Prisma.InputJsonValue },
      }),
      this.prisma.podcastEpisode.updateMany({
        where: { id: { in: affectedEpisodeIds } },
        data: { draftRevision: { increment: 1 } },
      }),
    ]);
    return settings;
  }

  async updateEpisode(classId: string, documentId: string, input: UpdateManagedEpisodeInput) {
    const episode = await this.episode(classId, documentId);
    const data: Prisma.PodcastEpisodeUpdateInput = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title || title.length > 160) this.badRequest('Episode title must be between 1 and 160 characters');
      data.titleOverride = title;
    }
    let invalidatesRender = false;
    if (input.draft !== undefined) {
      const turns = this.validateTurns(input.draft.turns);
      data.draftTurns = turns as unknown as Prisma.InputJsonValue;
      data.draftSummary = input.draft.summary?.trim() || '';
      invalidatesRender ||= !this.sameJson(turns, this.parseTurns(episode.draftTurns))
        || data.draftSummary !== (episode.draftSummary ?? '');
      if (input.draft.durationTargetMinutes !== undefined) {
        data.draftDurationTargetMinutes = this.duration(input.draft.durationTargetMinutes);
        invalidatesRender ||= data.draftDurationTargetMinutes !== (episode.draftDurationTargetMinutes ?? 10);
      }
    }
    if (input.voiceOverrides !== undefined) {
      const overrides = this.validateOverrides(input.voiceOverrides);
      data.voiceOverrides = overrides as unknown as Prisma.InputJsonValue;
      invalidatesRender ||= !this.sameJson(overrides, this.parseOverrides(episode.voiceOverrides));
    }
    if (invalidatesRender) data.draftRevision = { increment: 1 };
    await this.prisma.podcastEpisode.update({ where: { id: episode.id }, data });
    return { saved: true };
  }

  async generateDraft(classId: string, documentId: string, accessToken: string) {
    const episode = await this.episode(classId, documentId);
    let source: PodcastChunkInput;
    try {
      source = await this.chunks.getChunks(classId, documentId, accessToken, {
        documentName: episode.sourceDocument.documentName,
      });
    } catch (error) {
      throw new HttpException(
        { error: error instanceof Error ? error.message : 'Kiwi chunks are not available' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const script = await this.scripts.generate(source);
    const updated = await this.prisma.podcastEpisode.update({
      where: { id: episode.id },
      data: {
        draftSummary: script.summary,
        draftDurationTargetMinutes: script.durationTargetMinutes,
        draftTurns: script.turns as unknown as Prisma.InputJsonValue,
        draftRevision: { increment: 1 },
      },
    });
    return { ...script, revision: updated.draftRevision };
  }

  async startRender(classId: string, documentId: string) {
    const episode = await this.episode(classId, documentId);
    const turns = this.validateTurns(this.parseTurns(episode.draftTurns));
    const podcastClass = await this.prisma.podcastClass.findUniqueOrThrow({ where: { classId } });
    const defaults = this.parseSettings(podcastClass.voiceDefaults) ?? this.tts.defaultVoiceSettings();
    const settings = this.resolveSettings(defaults, this.parseOverrides(episode.voiceOverrides));
    const script: GeneratedPodcastScript = {
      title: episode.titleOverride || episode.title,
      summary: episode.draftSummary || '',
      durationTargetMinutes: episode.draftDurationTargetMinutes ?? 10,
      turns,
    };
    const started = await this.artifacts.beginJob(episode.episodeId, {
      classId,
      documentId,
      draftRevision: episode.draftRevision,
      settingsSnapshot: settings as unknown as Prisma.InputJsonValue,
    });
    if (started.started && started.job.id) {
      void this.completeRender(started.job.id, episode.episodeId, classId, documentId, script, settings);
    }
    return started.job;
  }

  async getJob(classId: string, jobId: string) {
    const job = await this.artifacts.readJobById(jobId);
    if (!job || job.classId !== classId) throw new NotFoundException('Render job not found');
    return job;
  }

  async jobAudioKey(classId: string, jobId: string) {
    const job = await this.getJob(classId, jobId);
    if (job.status !== 'ready') throw new NotFoundException('Render preview is not ready');
    const key = await this.artifacts.jobAudioStorageKey(jobId);
    if (!key) throw new NotFoundException('Render preview audio not found');
    return key;
  }

  async publish(classId: string, documentId: string, jobId: string) {
    const episode = await this.episode(classId, documentId);
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { audioAsset: true, script: true },
    });
    if (!job || job.episodeId !== episode.episodeId || job.classId !== classId) {
      throw new NotFoundException('Render job not found for this episode');
    }
    if (job.status !== 'ready' || !job.audioAsset || !job.script) {
      throw new ConflictException('Only a completed render can be published');
    }
    if (job.draftRevision !== episode.draftRevision) {
      throw new ConflictException('The draft or voice settings changed; render a new preview before publishing');
    }
    await this.prisma.podcastEpisode.update({
      where: { id: episode.id },
      data: {
        publishedJobId: job.id,
        status: 'ready',
        generatedAt: job.finishedAt ?? new Date(),
        errorMessage: null,
      },
    });
    return { published: true, jobId };
  }

  async resetEpisode(classId: string, documentId: string) {
    const episode = await this.episode(classId, documentId);
    const active = await this.prisma.generationJob.findFirst({
      where: { episodeId: episode.episodeId, status: 'generating' },
    });
    if (active) throw new ConflictException('A podcast cannot be deleted while rendering');
    const assets = await this.prisma.podcastAudioAsset.findMany({
      where: { episodeId: episode.episodeId },
      select: { storageKey: true },
    });
    for (const asset of assets) await this.audioStorage.delete(asset.storageKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.podcastEpisode.update({
        where: { id: episode.id },
        data: { publishedJobId: null, status: 'placeholder', generatedAt: null, errorMessage: null },
      });
      await tx.generationJob.deleteMany({ where: { episodeId: episode.episodeId } });
    });
    return { deleted: true, documentId };
  }

  previewVoice(profile: unknown) {
    return this.tts.preview(this.validateProfile(profile));
  }

  private async completeRender(
    jobId: string,
    episodeId: string,
    classId: string,
    documentId: string,
    script: GeneratedPodcastScript,
    settings: PodcastVoiceSettings,
  ) {
    try {
      let durationSeconds: number | undefined;
      await this.artifacts.updateJobProgress(jobId, 12, 'Saving script snapshot');
      await this.artifacts.writeScript(episodeId, script, jobId);
      await this.artifacts.updateJobProgress(jobId, 22, 'Building speaker voices');
      const audio = await this.audioProduction.produce(script, async ({ completedChunks, totalChunks }) => {
        const progress = 25 + Math.round((completedChunks / totalChunks) * 65);
        await this.artifacts.updateJobProgress(jobId, progress, `Generating audio — chunk ${completedChunks} of ${totalChunks}`);
      }, settings, (metadata) => {
        durationSeconds = metadata.durationSeconds;
      });
      await this.artifacts.updateJobProgress(jobId, 94, 'Saving preview audio');
      await this.artifacts.writeAudio(episodeId, audio, jobId);
      await this.artifacts.finishJob(jobId, episodeId, {
        classId,
        documentId,
        status: 'ready',
        generatedAt: new Date().toISOString(),
        durationSeconds,
      });
    } catch (error) {
      await this.artifacts.finishJob(jobId, episodeId, {
        classId,
        documentId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
  }

  private episode(classId: string, documentId: string) {
    return this.prisma.podcastEpisode.findFirstOrThrow({
      where: { classId, kiwiDocumentId: documentId },
      include: { sourceDocument: true },
    }).catch(() => { throw new NotFoundException('Class podcast episode not found'); });
  }

  private resolveSettings(defaults: PodcastVoiceSettings, overrides: EpisodeVoiceOverrides): PodcastVoiceSettings {
    return {
      host: overrides.host ?? defaults.host,
      speaker: overrides.speaker ?? defaults.speaker,
    };
  }

  private validateSettings(value: unknown): PodcastVoiceSettings {
    const candidate = value as Partial<PodcastVoiceSettings>;
    return {
      host: this.validateProfile(candidate?.host),
      speaker: this.validateProfile(candidate?.speaker),
    };
  }

  private validateOverrides(value: unknown): EpisodeVoiceOverrides {
    const candidate = value as EpisodeVoiceOverrides;
    return {
      ...(candidate?.host ? { host: this.validateProfile(candidate.host) } : {}),
      ...(candidate?.speaker ? { speaker: this.validateProfile(candidate.speaker) } : {}),
    };
  }

  private validateProfile(value: unknown): VoiceProfile {
    const profile = value as Partial<VoiceProfile>;
    if (profile?.mode !== 'preset' && profile?.mode !== 'custom') this.badRequest('Invalid voice mode');
    if (!PRESET_VOICES.includes(profile.voice as VoiceProfile['voice'])) this.badRequest('Invalid preset voice');
    const description = profile.description?.trim();
    const referenceText = profile.referenceText?.trim();
    if (!description || description.length > 500) this.badRequest('Voice description is required and must be at most 500 characters');
    if (!referenceText || referenceText.length > 300) this.badRequest('Reference phrase is required and must be at most 300 characters');
    if (!Number.isInteger(profile.seed) || Math.abs(profile.seed!) > 2147483647) this.badRequest('Voice seed must be an integer');
    return {
      mode: profile.mode,
      voice: profile.voice as VoiceProfile['voice'],
      description,
      seed: profile.seed!,
      referenceText,
    };
  }

  private validateTurns(value: unknown): PodcastTurn[] {
    if (!Array.isArray(value) || value.length === 0) this.badRequest('Script must contain at least one host or speaker line');
    return value.map((turn) => {
      const candidate = turn as Partial<PodcastTurn>;
      if ((candidate.speaker !== 'HOST_A' && candidate.speaker !== 'HOST_B') || !candidate.text?.trim()) {
        this.badRequest('Every script line must have a valid host or speaker and non-empty text');
      }
      return { speaker: candidate.speaker, text: candidate.text.trim() } as PodcastTurn;
    });
  }

  private duration(value?: number) {
    const duration = value ?? 10;
    if (!Number.isInteger(duration) || duration < 1 || duration > 60) this.badRequest('Duration must be between 1 and 60 minutes');
    return duration;
  }

  private parseSettings(value: Prisma.JsonValue | null): PodcastVoiceSettings | null {
    if (!value) return null;
    try { return this.validateSettings(value); } catch { return null; }
  }

  private parseOverrides(value: Prisma.JsonValue | null): EpisodeVoiceOverrides {
    if (!value) return {};
    try { return this.validateOverrides(value); } catch { return {}; }
  }

  private parseTurns(value: Prisma.JsonValue | null): PodcastTurn[] {
    return Array.isArray(value) ? value as unknown as PodcastTurn[] : [];
  }

  private sameJson(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private jobResponse(job: {
    id: string;
    status: string;
    progressPercent: number;
    statusMessage: string;
    errorMessage: string | null;
    draftRevision: number | null;
    durationSeconds: number | null;
    finishedAt: Date | null;
    updatedAt: Date;
    audioAsset: { storageKey: string } | null;
  }) {
    return {
      jobId: job.id,
      status: job.status,
      progressPercent: job.progressPercent,
      statusMessage: job.statusMessage,
      errorMessage: job.errorMessage,
      draftRevision: job.draftRevision,
      durationSeconds: job.durationSeconds,
      generatedAt: job.finishedAt?.toISOString() ?? null,
      previewAvailable: Boolean(job.audioAsset),
    };
  }

  private badRequest(message: string): never {
    throw new HttpException({ error: message }, HttpStatus.BAD_REQUEST);
  }
}
