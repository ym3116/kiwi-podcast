import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PodcastVoiceSettings } from './podcast-management.types';
import { PodcastVoiceSettingsService } from './podcast-voice-settings.service';

const GLOBAL_SETTINGS_KEY = 'global';

export interface PodcastGlobalSettingsState {
  defaults: PodcastVoiceSettings;
  source: 'environment' | 'saved';
  updatedAt: string | null;
}

@Injectable()
export class PodcastGlobalSettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PodcastVoiceSettingsService)
    private readonly voices: PodcastVoiceSettingsService,
  ) {}

  async getState(): Promise<PodcastGlobalSettingsState> {
    const row = await this.prisma.podcastGlobalSettings.findUnique({
      where: { key: GLOBAL_SETTINGS_KEY },
    });
    const saved = this.voices.parseSettings(row?.voiceDefaults ?? null);
    return {
      defaults: saved ?? this.voices.environmentDefaults(),
      source: saved ? 'saved' : 'environment',
      updatedAt: saved && row ? row.updatedAt.toISOString() : null,
    };
  }

  async getDefaults(): Promise<PodcastVoiceSettings> {
    return (await this.getState()).defaults;
  }

  async update(value: unknown, userId: string): Promise<PodcastGlobalSettingsState> {
    const next = this.voices.validateSettings(value);
    const previous = await this.getDefaults();
    const inheritedClasses = await this.prisma.podcastClass.findMany({
      where: { voiceDefaults: { equals: Prisma.DbNull } },
      include: { documents: { include: { episode: true } } },
    });
    const affectedEpisodeIds = inheritedClasses.flatMap((podcastClass) =>
      podcastClass.documents.flatMap((document) => {
        if (!document.episode) return [];
        const overrides = this.voices.parseOverrides(document.episode.voiceOverrides);
        const before = this.voices.resolve(previous, overrides);
        const after = this.voices.resolve(next, overrides);
        return this.voices.same(before, after) ? [] : [document.episode.id];
      }),
    );

    const [, saved] = await this.prisma.$transaction([
      this.prisma.podcastEpisode.updateMany({
        where: { id: { in: affectedEpisodeIds } },
        data: { draftRevision: { increment: 1 } },
      }),
      this.prisma.podcastGlobalSettings.upsert({
        where: { key: GLOBAL_SETTINGS_KEY },
        create: {
          key: GLOBAL_SETTINGS_KEY,
          voiceDefaults: next as unknown as Prisma.InputJsonValue,
          updatedByUserId: userId,
        },
        update: {
          voiceDefaults: next as unknown as Prisma.InputJsonValue,
          updatedByUserId: userId,
        },
      }),
    ]);

    return {
      defaults: next,
      source: 'saved',
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  preview(value: unknown): Promise<Buffer> {
    return this.voices.preview(value);
  }
}
