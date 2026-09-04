import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PODCAST_APP_SLUG } from './podcast-app.config';

export interface PodcastAdminClassSummary {
  classId: string;
  className: string;
  podcastEnabled: boolean;
  voiceSource: 'global' | 'class' | null;
  episodeCount: number;
  lastActivityAt: string | null;
}

interface KiwiClassRecord {
  id?: unknown;
  name?: unknown;
  className?: unknown;
  metadata?: unknown;
}

@Injectable()
export class PodcastAdminClassesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KiwiMcpClient) private readonly kiwi: KiwiMcpClient,
  ) {}

  async list(accessToken: string): Promise<{ classes: PodcastAdminClassSummary[] }> {
    const kiwiClasses = await this.getKiwiClasses(accessToken);
    const classIds = kiwiClasses.map((item) => item.classId);

    const [scopeStates, podcastClasses, publishedEpisodes, generationActivity] = await Promise.all([
      Promise.all(
        kiwiClasses.map(async (item) => ({
          classId: item.classId,
          scopes: await this.getClassScopes(accessToken, item.classId),
        })),
      ),
      this.prisma.podcastClass.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, voiceDefaults: true, updatedAt: true },
      }),
      this.prisma.podcastEpisode.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds }, publishedJobId: { not: null } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.generationJob.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds } },
        _max: { updatedAt: true },
      }),
    ]);

    const scopesByClass = new Map(scopeStates.map((item) => [item.classId, item.scopes]));
    const podcastClassById = new Map(podcastClasses.map((item) => [item.classId, item]));
    const episodesByClass = new Map(publishedEpisodes.map((item) => [item.classId, item]));
    const activityByClass = new Map(generationActivity.map((item) => [item.classId, item]));

    const classes = kiwiClasses.map(({ classId, className }): PodcastAdminClassSummary => {
      const scopes = scopesByClass.get(classId);
      const podcastEnabled = Boolean(scopes?.effectiveScopes.length);
      const podcastClass = podcastClassById.get(classId);
      const episodes = episodesByClass.get(classId);
      const generation = activityByClass.get(classId);
      const lastActivityAt = podcastEnabled
        ? this.latestDate(
            podcastClass?.updatedAt,
            episodes?._max.updatedAt,
            generation?._max.updatedAt,
          )
        : null;

      return {
        classId,
        className,
        podcastEnabled,
        voiceSource: podcastEnabled
          ? this.hasClassVoiceDefaults(podcastClass?.voiceDefaults) ? 'class' : 'global'
          : null,
        episodeCount: podcastEnabled ? episodes?._count._all ?? 0 : 0,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
      };
    });

    classes.sort((left, right) => {
      const activityOrder = (right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0)
        - (left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0);
      return activityOrder || left.className.localeCompare(right.className);
    });

    return { classes };
  }

  private async getKiwiClasses(
    accessToken: string,
  ): Promise<Array<{ classId: string; className: string }>> {
    let resource: unknown;
    try {
      resource = await this.kiwi.readResource(accessToken, 'kiwi://classes');
    } catch {
      throw new BadGatewayException('Unable to load classes from Kiwi');
    }

    const body = resource as { classes?: unknown; error?: unknown } | null;
    if (typeof body?.error === 'string') throw new BadGatewayException(body.error);
    const rows = Array.isArray(body?.classes) ? body.classes : [];
    const seen = new Set<string>();
    return rows.flatMap((value) => {
      const row = value as KiwiClassRecord;
      const classId = typeof row.id === 'string' ? row.id.trim() : '';
      if (!classId || seen.has(classId)) return [];
      seen.add(classId);
      const metadata = row.metadata && typeof row.metadata === 'object'
        ? row.metadata as Record<string, unknown>
        : {};
      const candidates = [row.name, row.className, metadata.className, metadata.name];
      const className = candidates.find(
        (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
      )?.trim() ?? 'Untitled class';
      return [{ classId, className }];
    });
  }

  private async getClassScopes(accessToken: string, classId: string) {
    try {
      return await this.kiwi.getClassAppScopes(accessToken, PODCAST_APP_SLUG, classId);
    } catch {
      throw new BadGatewayException(`Unable to determine Podcast status for class ${classId}`);
    }
  }

  private hasClassVoiceDefaults(value: unknown): boolean {
    return value !== null && value !== undefined;
  }

  private latestDate(...values: Array<Date | null | undefined>): Date | null {
    const dates = values.filter((value): value is Date => value instanceof Date);
    if (!dates.length) return null;
    return dates.reduce((latest, value) => value > latest ? value : latest);
  }
}
