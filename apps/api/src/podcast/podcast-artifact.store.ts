import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PodcastJobStatus as PrismaPodcastJobStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AudioStorageService } from '../storage/audio-storage.service';
import { PodcastResponse } from '../types/podcast';
import {
  GeneratedPodcastScript,
  PodcastJob,
  PodcastJobStatus,
} from './podcast-generation.types';

@Injectable()
export class PodcastArtifactStore {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
  ) {}

  async readJob(episodeId: string): Promise<PodcastJob | null> {
    const job = await this.prisma.generationJob.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      include: { audioAsset: true },
    });
    return job ? this.toPodcastJob(job) : null;
  }

  async readJobById(jobId: string): Promise<PodcastJob | null> {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { audioAsset: true },
    });
    return job ? this.toPodcastJob(job) : null;
  }

  async readPublishedJob(episodeId: string): Promise<PodcastJob | null> {
    const episode = await this.prisma.podcastEpisode.findUnique({
      where: { episodeId },
      include: { publishedJob: { include: { audioAsset: true } } },
    });
    return episode?.publishedJob ? this.toPodcastJob(episode.publishedJob) : null;
  }

  async writeJob(job: PodcastJob): Promise<PodcastJob> {
    await this.markJob(job.episodeId, job);
    return job;
  }

  async beginJob(
    episodeId: string,
    patch: {
      classId: string;
      documentId: string;
      inputMetadata?: Prisma.InputJsonValue;
      draftRevision?: number;
      settingsSnapshot?: Prisma.InputJsonValue;
    },
  ): Promise<{ job: PodcastJob; started: boolean }> {
    const active = await this.prisma.generationJob.findFirst({
      where: { episodeId, status: 'generating' },
      orderBy: { createdAt: 'desc' },
      include: { audioAsset: true },
    });
    if (active) return { job: this.toPodcastJob(active), started: false };

    const episode = await this.ensureEpisode(episodeId, patch.classId, patch.documentId);
    try {
      const job = await this.prisma.generationJob.create({
        data: {
          episodeId: episode.episodeId,
          classId: patch.classId,
          kiwiDocumentId: patch.documentId,
          status: 'generating',
          inputMetadata: patch.inputMetadata,
          draftRevision: patch.draftRevision,
          settingsSnapshot: patch.settingsSnapshot,
          progressPercent: 5,
          statusMessage: 'Waiting to start',
        },
        include: { audioAsset: true },
      });
      await this.prisma.podcastEpisode.update({
        where: { episodeId },
        data: { status: 'generating', errorMessage: null },
      });
      return { job: this.toPodcastJob(job), started: true };
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const concurrent = await this.prisma.generationJob.findFirstOrThrow({
          where: { episodeId, status: 'generating' },
          orderBy: { createdAt: 'desc' },
          include: { audioAsset: true },
        });
        return { job: this.toPodcastJob(concurrent), started: false };
      }
      throw error;
    }
  }

  async markJob(
    episodeId: string,
    patch: Omit<Partial<PodcastJob>, 'episodeId'> & {
      classId: string;
      documentId: string;
      status: PodcastJobStatus;
    },
  ): Promise<PodcastJob> {
    await this.ensureEpisode(episodeId, patch.classId, patch.documentId);
    const current =
      (await this.prisma.generationJob.findFirst({
        where: { episodeId, status: 'generating' },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.generationJob.findFirst({
        where: { episodeId },
        orderBy: { createdAt: 'desc' },
      }));

    const finishedAt = patch.status === 'ready' || patch.status === 'failed' ? new Date() : null;
    const job = current
      ? await this.prisma.generationJob.update({
          where: { id: current.id },
          data: {
            status: this.toPrismaStatus(patch.status),
            errorMessage: patch.errorMessage,
            finishedAt,
            progressPercent: patch.status === 'ready' ? 100 : undefined,
            statusMessage:
              patch.status === 'ready'
                ? 'Preview ready'
                : patch.status === 'failed'
                  ? 'Generation stopped'
                  : undefined,
          },
          include: { audioAsset: true },
        })
      : await this.prisma.generationJob.create({
          data: {
            episodeId,
            classId: patch.classId,
            kiwiDocumentId: patch.documentId,
            status: this.toPrismaStatus(patch.status),
            errorMessage: patch.errorMessage,
            finishedAt,
          },
          include: { audioAsset: true },
        });

    await this.prisma.podcastEpisode.update({
      where: { episodeId },
      data: {
        status: this.toPrismaStatus(patch.status),
        generatedAt: patch.generatedAt ? new Date(patch.generatedAt) : undefined,
        errorMessage: patch.errorMessage,
      },
    });
    return this.toPodcastJob(job);
  }

  async updateJobProgress(
    jobId: string,
    progressPercent: number,
    statusMessage: string,
  ): Promise<void> {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { progressPercent, statusMessage },
    });
  }

  async writeScript(
    episodeId: string,
    script: GeneratedPodcastScript,
    jobId?: string,
  ): Promise<{ scriptPath: string }> {
    const job = await this.renderJob(episodeId, jobId);
    await this.prisma.podcastScript.create({
      data: {
        episodeId,
        jobId: job.id,
        title: script.title,
        summary: script.summary,
        durationTargetMinutes: script.durationTargetMinutes,
        turns: script.turns as unknown as Prisma.InputJsonValue,
      },
    });
    return { scriptPath: `postgres://podcast_scripts/${job.id}` };
  }

  async readScript(episodeId: string): Promise<GeneratedPodcastScript | null> {
    const script = await this.prisma.podcastScript.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
    });
    if (!script) return null;

    return {
      title: script.title,
      summary: script.summary,
      durationTargetMinutes: script.durationTargetMinutes,
      turns: script.turns as unknown as GeneratedPodcastScript['turns'],
    };
  }

  async readScriptForJob(jobId: string): Promise<GeneratedPodcastScript | null> {
    const script = await this.prisma.podcastScript.findUnique({ where: { jobId } });
    if (!script) return null;
    return {
      title: script.title,
      summary: script.summary,
      durationTargetMinutes: script.durationTargetMinutes,
      turns: script.turns as unknown as GeneratedPodcastScript['turns'],
    };
  }

  async writeAudio(episodeId: string, audio: Buffer, jobId?: string): Promise<{ storageKey: string }> {
    const job = await this.renderJob(episodeId, jobId);
    const storageKey = `class-episodes/${this.safeId(episodeId)}/${job.id}.mp3`;
    await this.audioStorage.upload(storageKey, audio);
    try {
      await this.prisma.podcastAudioAsset.create({
        data: {
          episodeId,
          jobId: job.id,
          storageKey,
          mimeType: 'audio/mpeg',
          byteSize: audio.byteLength,
          checksum: createHash('sha256').update(audio).digest('hex'),
        },
      });
      return { storageKey };
    } catch (error) {
      await this.audioStorage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async syncCatalog(response: PodcastResponse): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.podcastClass.upsert({
        where: { classId: response.podcast.classId },
        create: {
          classId: response.podcast.classId,
          title: response.podcast.title,
          description: response.podcast.description,
          coverTheme: response.podcast.coverTheme,
        },
        update: {
          title: response.podcast.title,
          description: response.podcast.description,
          coverTheme: response.podcast.coverTheme,
        },
      });

      for (const episode of response.episodes) {
        const document = await tx.sourceDocument.upsert({
          where: {
            classId_kiwiDocumentId: {
              classId: response.podcast.classId,
              kiwiDocumentId: episode.documentId,
            },
          },
          create: {
            classId: response.podcast.classId,
            kiwiDocumentId: episode.documentId,
            documentName: episode.documentName,
            materialType: episode.materialType,
            lectureNumber: episode.lectureNumber,
          },
          update: {
            documentName: episode.documentName,
            materialType: episode.materialType,
            lectureNumber: episode.lectureNumber,
          },
        });

        await tx.podcastEpisode.upsert({
          where: { episodeId: episode.id },
          create: {
            episodeId: episode.id,
            classId: response.podcast.classId,
            kiwiDocumentId: episode.documentId,
            sourceDocumentId: document.id,
            title: episode.title,
            durationLabel: episode.durationLabel,
            status: this.toPrismaStatus(episode.status),
          },
          update: {
            classId: response.podcast.classId,
            kiwiDocumentId: episode.documentId,
            sourceDocumentId: document.id,
            title: episode.title,
            durationLabel: episode.durationLabel,
          },
        });
      }
    });
  }

  async audioStorageKey(episodeId: string): Promise<string | null> {
    const episode = await this.prisma.podcastEpisode.findUnique({
      where: { episodeId },
      select: { publishedJob: { select: { audioAsset: { select: { storageKey: true } } } } },
    });
    return episode?.publishedJob?.audioAsset?.storageKey ?? null;
  }

  async jobAudioStorageKey(jobId: string): Promise<string | null> {
    const asset = await this.prisma.podcastAudioAsset.findUnique({
      where: { jobId },
      select: { storageKey: true },
    });
    return asset?.storageKey ?? null;
  }

  async titleOverride(episodeId: string): Promise<string | null> {
    const episode = await this.prisma.podcastEpisode.findUnique({
      where: { episodeId },
      select: { titleOverride: true },
    });
    return episode?.titleOverride ?? null;
  }

  async finishJob(
    jobId: string,
    episodeId: string,
    patch: {
      classId: string;
      documentId: string;
      status: 'ready' | 'failed';
      errorMessage?: string;
      generatedAt?: string;
    },
  ): Promise<PodcastJob> {
    const existing = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!existing || existing.episodeId !== episodeId || existing.status !== 'generating') {
      throw new Error('Render job is no longer active');
    }
    const job = await this.prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: patch.status,
        errorMessage: patch.errorMessage,
        finishedAt: new Date(),
        progressPercent: patch.status === 'ready' ? 100 : existing.progressPercent,
        statusMessage: patch.status === 'ready' ? 'Preview ready' : 'Generation stopped',
      },
      include: { audioAsset: true },
    });
    await this.prisma.podcastEpisode.update({
      where: { episodeId },
      data: {
        status: patch.status,
        generatedAt: patch.generatedAt ? new Date(patch.generatedAt) : undefined,
        errorMessage: patch.errorMessage ?? null,
      },
    });
    return this.toPodcastJob(job);
  }

  private async activeJob(episodeId: string) {
    return this.prisma.generationJob.findFirstOrThrow({
      where: { episodeId, status: 'generating' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async renderJob(episodeId: string, jobId?: string) {
    if (!jobId) return this.activeJob(episodeId);
    return this.prisma.generationJob.findFirstOrThrow({
      where: { id: jobId, episodeId, status: 'generating' },
    });
  }

  private async ensureEpisode(episodeId: string, classId: string, documentId: string) {
    const existing = await this.prisma.podcastEpisode.findUnique({ where: { episodeId } });
    if (existing) return existing;

    await this.prisma.podcastClass.upsert({
      where: { classId },
      create: {
        classId,
        title: `${classId} Podcast`,
        description: 'Generated lecture episodes for this Kiwi class.',
        coverTheme: 'kiwi-gradient',
      },
      update: {},
    });
    const document = await this.prisma.sourceDocument.upsert({
      where: { classId_kiwiDocumentId: { classId, kiwiDocumentId: documentId } },
      create: {
        classId,
        kiwiDocumentId: documentId,
        documentName: documentId,
        materialType: 'document',
        lectureNumber: 0,
      },
      update: {},
    });
    return this.prisma.podcastEpisode.create({
      data: {
        episodeId,
        classId,
        kiwiDocumentId: documentId,
        sourceDocumentId: document.id,
        title: `Podcast episode for ${documentId}`,
        durationLabel: '0 min',
        status: 'placeholder',
      },
    });
  }

  private toPodcastJob(
    job: {
      id: string;
      episodeId: string;
      classId: string;
      kiwiDocumentId: string;
      status: PrismaPodcastJobStatus;
      errorMessage: string | null;
      progressPercent: number;
      statusMessage: string;
      draftRevision: number | null;
      updatedAt: Date;
      finishedAt: Date | null;
      audioAsset?: { storageKey: string } | null;
    },
  ): PodcastJob {
    return {
      id: job.id,
      episodeId: job.episodeId,
      classId: job.classId,
      documentId: job.kiwiDocumentId,
      status: job.status,
      progressPercent: job.progressPercent,
      statusMessage: job.statusMessage,
      draftRevision: job.draftRevision ?? undefined,
      audioStorageKey: job.audioAsset?.storageKey,
      audioUrl: job.status === 'ready' ? this.audioUrl(job.episodeId, job.id) : undefined,
      generatedAt: job.status === 'ready' ? job.finishedAt?.toISOString() : undefined,
      updatedAt: job.updatedAt.toISOString(),
      errorMessage: job.errorMessage ?? undefined,
    };
  }

  private toPrismaStatus(status: PodcastJobStatus): PrismaPodcastJobStatus {
    return status;
  }

  private audioUrl(episodeId: string, jobId?: string): string {
    const base = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(
      /\/$/,
      '',
    );
    const suffix = jobId ? `?v=${encodeURIComponent(jobId)}` : '';
    return `${base}/api/podcast/audio/${encodeURIComponent(episodeId)}${suffix}`;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private safeId(id: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      throw new Error('Podcast artifact ID can only contain letters, numbers, dots, underscores, and dashes');
    }
    return id;
  }
}
