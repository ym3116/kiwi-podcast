import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PersonalPodcast, PersonalPodcastStatus, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { LocalDemoChunkSource } from './local-demo-chunk-source';
import { PodcastDifficulty } from './podcast-generation.types';
import { ScriptGeneratorService } from './script-generator.service';
import { TtsService } from './tts.service';

export interface CreatePersonalPodcastInput {
  ownerUserId: string;
  prompt: string;
  materialIds: string[];
  durationMinutes: 5 | 10 | 15;
  difficulty: PodcastDifficulty;
}

@Injectable()
export class PersonalPodcastService {
  private readonly audioRoot =
    process.env.PODCAST_AUDIO_DIR ?? path.resolve(__dirname, '../../.podcasts/audio');
  private readonly publicBase = (process.env.PODCAST_PUBLIC_API_BASE ?? 'http://localhost:8010').replace(
    /\/$/,
    '',
  );

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalDemoChunkSource) private readonly source: LocalDemoChunkSource,
    @Inject(ScriptGeneratorService) private readonly scripts: ScriptGeneratorService,
    @Inject(TtsService) private readonly tts: TtsService,
  ) {}

  listMaterials() {
    return this.source.listDemoMaterials();
  }

  async create(classId: string, input: CreatePersonalPodcastInput) {
    await this.validateInput(input);
    const materials = await this.source.listDemoMaterials();
    const selected = input.materialIds.map((id) => materials.find((material) => material.id === id)!);
    const podcast = await this.prisma.personalPodcast.create({
      data: {
        classId,
        ownerUserId: input.ownerUserId,
        prompt: input.prompt.trim(),
        durationMinutes: input.durationMinutes,
        difficulty: input.difficulty,
        selectedMaterials: selected as unknown as Prisma.InputJsonValue,
      },
    });
    void this.generate(podcast.id);
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

  async retry(classId: string, id: string, ownerUserId: string) {
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
    void this.generate(id);
    return this.toResponse(reset);
  }

  async audioPath(id: string, ownerUserId?: string): Promise<string> {
    const podcast = await this.prisma.personalPodcast.findUnique({ where: { id } });
    if (!podcast || podcast.status !== 'ready' || !podcast.audioPath) {
      throw new HttpException({ error: 'Podcast audio not found' }, HttpStatus.NOT_FOUND);
    }
    if (ownerUserId && podcast.ownerUserId !== ownerUserId) {
      throw new HttpException({ error: 'Podcast not found' }, HttpStatus.NOT_FOUND);
    }
    return podcast.audioPath;
  }

  private async validateInput(input: CreatePersonalPodcastInput) {
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
    const available = new Set((await this.source.listDemoMaterials()).map((material) => material.id));
    if (unique.some((id) => !available.has(id))) this.badRequest('One or more materials do not exist');
  }

  private async generate(id: string) {
    try {
      const podcast = await this.prisma.personalPodcast.findUniqueOrThrow({ where: { id } });
      const materials = podcast.selectedMaterials as unknown as Array<{ id: string }>;
      await this.stage(id, 'preparing_materials', 15, 'Preparing selected materials', {
        startedAt: new Date(),
      });
      const bundle = await this.source.getCombinedChunks(
        podcast.classId,
        materials.map((material) => material.id),
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
      const audio = await this.tts.synthesize(script);
      await this.stage(id, 'saving', 95, 'Saving your podcast');
      await mkdir(this.audioRoot, { recursive: true });
      const audioPath = path.join(this.audioRoot, `personal-${id}.mp3`);
      await writeFile(audioPath, audio);
      const audioUrl = `${this.publicBase}/api/podcast/my-podcasts/${id}/audio`;
      await this.stage(id, 'ready', 100, 'Your podcast is ready', {
        audioPath,
        audioUrl,
        completedAt: new Date(),
      });
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
      audioUrl: podcast.audioUrl,
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
}
