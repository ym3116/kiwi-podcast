import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PersonalPodcast, PersonalPodcastStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AudioStorageService } from '../storage/audio-storage.service';
import { PodcastChunkSourceService } from './podcast-chunk-source.service';
import { PodcastMaterial } from './podcast-chunk-source';
import { PodcastDifficulty } from './podcast-generation.types';
import { ScriptGeneratorService } from './script-generator.service';
import { AudioProductionService } from './audio-production.service';

export interface CreatePersonalPodcastInput {
  ownerUserId: string;
  prompt: string;
  materialIds: string[];
  durationMinutes: 5 | 10 | 15;
  difficulty: PodcastDifficulty;
}

@Injectable()
export class PersonalPodcastService {
  private readonly publicBase = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(
    /\/$/,
    '',
  );

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PodcastChunkSourceService) private readonly source: PodcastChunkSourceService,
    @Inject(ScriptGeneratorService) private readonly scripts: ScriptGeneratorService,
    @Inject(AudioProductionService) private readonly audioProduction: AudioProductionService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
  ) {}

  async listMaterials(classId: string, accessToken: string) {
    try {
      return await this.source.listMaterials(classId, accessToken);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const status = /denied|missing required scope/i.test(message)
        ? HttpStatus.FORBIDDEN
        : /rejected or expired the app token/i.test(message)
          ? HttpStatus.UNAUTHORIZED
          : /not available|does not contain any text chunks/i.test(message)
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.BAD_GATEWAY;
      throw new HttpException({ error: message }, status);
    }
  }

  async create(classId: string, input: CreatePersonalPodcastInput, accessToken: string) {
    const selected = await this.validateInput(classId, input, accessToken);
    const selectedMetadata = selected.map((material) => ({ ...material, preview: '' }));
    const podcast = await this.prisma.personalPodcast.create({
      data: {
        classId,
        ownerUserId: input.ownerUserId,
        prompt: input.prompt.trim(),
        durationMinutes: input.durationMinutes,
        difficulty: input.difficulty,
        selectedMaterials: selectedMetadata as unknown as Prisma.InputJsonValue,
      },
    });
    void this.generate(podcast.id, accessToken);
    return this.toResponse(podcast);
  }

  async list(classId: string, ownerUserId: string) {
    if (!ownerUserId) this.badRequest('ownerUserId is required');
    const podcasts = await this.prisma.personalPodcast.findMany({
      where: { classId, ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
    return podcasts.map((podcast) => this.toResponse(podcast));
  }

  async get(classId: string, id: string, ownerUserId: string) {
    const podcast = await this.owned(classId, id, ownerUserId);
    return this.toResponse(podcast);
  }

  async retry(classId: string, id: string, ownerUserId: string, accessToken: string) {
    const podcast = await this.owned(classId, id, ownerUserId);
    if (podcast.status !== 'failed') {
      throw new HttpException({ error: 'Only failed podcasts can be retried' }, HttpStatus.CONFLICT);
    }
    const reset = await this.prisma.personalPodcast.update({
      where: { id },
      data: {
        status: 'queued',
        progressPercent: 5,
        statusMessage: 'Waiting to start',
        errorMessage: null,
        completedAt: null,
      },
    });
    void this.generate(id, accessToken);
    return this.toResponse(reset);
  }

  async delete(classId: string, id: string, ownerUserId: string) {
    const podcast = await this.owned(classId, id, ownerUserId);
    if (!['ready', 'failed'].includes(podcast.status)) {
      throw new HttpException(
        { error: 'A podcast cannot be deleted while generation is running' },
        HttpStatus.CONFLICT,
      );
    }
    if (podcast.audioStorageKey) {
      await this.audioStorage.delete(podcast.audioStorageKey);
    }
    await this.prisma.personalPodcast.delete({ where: { id: podcast.id } });
    return { deleted: true, id: podcast.id };
  }

  async audioStorageKey(id: string, ownerUserId: string): Promise<string> {
    const podcast = await this.prisma.personalPodcast.findUnique({ where: { id } });
    if (!podcast || podcast.status !== 'ready' || !podcast.audioStorageKey) {
      throw new HttpException({ error: 'Podcast audio not found' }, HttpStatus.NOT_FOUND);
    }
    if (!ownerUserId || podcast.ownerUserId !== ownerUserId) {
      throw new HttpException({ error: 'Podcast not found' }, HttpStatus.NOT_FOUND);
    }
    return podcast.audioStorageKey;
  }

  private async validateInput(
    classId: string,
    input: CreatePersonalPodcastInput,
    accessToken: string,
  ): Promise<PodcastMaterial[]> {
    if (!input.ownerUserId?.trim()) this.badRequest('ownerUserId is required');
    if (input.prompt?.trim().length < 10 || input.prompt.trim().length > 1000) {
      this.badRequest('Prompt must be between 10 and 1000 characters');
    }
    if (![5, 10, 15].includes(input.durationMinutes)) this.badRequest('Invalid duration');
    if (!['beginner', 'intermediate', 'advanced'].includes(input.difficulty)) {
      this.badRequest('Invalid difficulty');
    }
    const unique = [...new Set(input.materialIds ?? [])];
    if (unique.length < 1 || unique.length > 5 || unique.length !== input.materialIds?.length) {
      this.badRequest('Choose between one and five unique materials');
    }
    const materials = await this.listMaterials(classId, accessToken);
    const available = new Map(materials.map((material) => [material.id, material]));
    if (unique.some((id) => !available.has(id))) this.badRequest('One or more materials do not exist');
    return unique.map((id) => available.get(id)!);
  }

  private async generate(id: string, accessToken: string) {
    try {
      const podcast = await this.prisma.personalPodcast.findUniqueOrThrow({ where: { id } });
      const materials = podcast.selectedMaterials as unknown as Array<{ id: string }>;
      await this.stage(id, 'preparing_materials', 15, 'Preparing selected materials', {
        startedAt: new Date(),
      });
      const bundle = await this.source.getCombinedChunks(
        podcast.classId,
        materials.map((material) => material.id),
        accessToken,
      );
      await this.stage(id, 'generating_script', 35, 'Writing your podcast', {
        sourceMetadata: bundle.sourceMetadata as unknown as Prisma.InputJsonValue,
      });
      const script = await this.scripts.generatePersonal({
        ...bundle,
        prompt: podcast.prompt,
        durationMinutes: podcast.durationMinutes as 5 | 10 | 15,
        difficulty: podcast.difficulty as PodcastDifficulty,
      });
      await this.stage(id, 'validating_script', 50, 'Reviewing the generated script');
      await this.stage(id, 'generating_audio', 65, 'Generating host voices', {
        title: script.title,
        summary: script.summary,
        turns: script.turns as unknown as Prisma.InputJsonValue,
      });
      const audio = await this.audioProduction.produce(script, async ({ completedChunks, totalChunks }) => {
        const progress = 55 + Math.round((completedChunks / totalChunks) * 30);
        await this.stage(
          id,
          'generating_audio',
          progress,
          `Generating conversation — chunk ${completedChunks} of ${totalChunks}`,
        );
      });
      await this.stage(id, 'saving', 95, 'Saving your podcast');
      const storageKey = `personal/${this.safeKeyPart(podcast.ownerUserId)}/${id}.mp3`;
      await this.audioStorage.upload(storageKey, audio);
      try {
        await this.stage(id, 'ready', 100, 'Your podcast is ready', {
          audioStorageKey: storageKey,
          completedAt: new Date(),
        });
      } catch (error) {
        await this.audioStorage.delete(storageKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await this.prisma.personalPodcast.update({
        where: { id },
        data: {
          status: 'failed',
          statusMessage: 'Generation stopped',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
    }
  }

  private stage(
    id: string,
    status: PersonalPodcastStatus,
    progressPercent: number,
    statusMessage: string,
    extra: Prisma.PersonalPodcastUpdateInput = {},
  ) {
    return this.prisma.personalPodcast.update({
      where: { id },
      data: { status, progressPercent, statusMessage, ...extra },
    });
  }

  private async owned(classId: string, id: string, ownerUserId: string) {
    const podcast = await this.prisma.personalPodcast.findFirst({
      where: { id, classId, ownerUserId },
    });
    if (!podcast) throw new HttpException({ error: 'Podcast not found' }, HttpStatus.NOT_FOUND);
    return podcast;
  }

  private toResponse(podcast: PersonalPodcast) {
    return {
      id: podcast.id,
      classId: podcast.classId,
      ownerUserId: podcast.ownerUserId,
      prompt: podcast.prompt,
      title: podcast.title ?? 'Untitled podcast',
      summary: podcast.summary ?? '',
      durationMinutes: podcast.durationMinutes,
      difficulty: podcast.difficulty,
      status: podcast.status,
      progressPercent: podcast.progressPercent,
      statusMessage: podcast.statusMessage,
      selectedMaterials: podcast.selectedMaterials,
      turns: podcast.turns,
      audioUrl:
        podcast.status === 'ready' && podcast.audioStorageKey
          ? `${this.publicBase}/api/podcast/my-podcasts/${podcast.id}/audio?ownerUserId=${encodeURIComponent(podcast.ownerUserId)}`
          : undefined,
      errorMessage: podcast.errorMessage,
      startedAt: podcast.startedAt?.toISOString(),
      completedAt: podcast.completedAt?.toISOString(),
      createdAt: podcast.createdAt.toISOString(),
      updatedAt: podcast.updatedAt.toISOString(),
    };
  }

  private badRequest(message: string): never {
    throw new HttpException({ error: message }, HttpStatus.BAD_REQUEST);
  }

  private safeKeyPart(value: string): string {
    return encodeURIComponent(value).replace(/%/g, '_');
  }
}
