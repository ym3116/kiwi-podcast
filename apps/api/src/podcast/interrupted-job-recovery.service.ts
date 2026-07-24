import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PersonalPodcastStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const interruptedMessage =
  'Generation was interrupted by an API restart. Retry the podcast to start again.';

const activePersonalPodcastStatuses: PersonalPodcastStatus[] = [
  'queued',
  'preparing_materials',
  'generating_script',
  'validating_script',
  'generating_audio',
  'saving',
];

@Injectable()
export class InterruptedJobRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InterruptedJobRecoveryService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const interruptedJobs = await this.prisma.generationJob.findMany({
      where: { status: 'generating' },
      select: { episodeId: true },
    });
    const episodeIds = [...new Set(interruptedJobs.map((job) => job.episodeId))];
    const now = new Date();

    const [, , , personalPodcasts] = await this.prisma.$transaction([
      this.prisma.generationJob.updateMany({
        where: { status: 'generating' },
        data: {
          status: 'failed',
          statusMessage: 'Generation interrupted',
          errorMessage: interruptedMessage,
          finishedAt: now,
        },
      }),
      this.prisma.podcastEpisode.updateMany({
        where: {
          episodeId: { in: episodeIds },
          publishedJobId: null,
          status: 'generating',
        },
        data: {
          status: 'failed',
          errorMessage: interruptedMessage,
        },
      }),
      this.prisma.podcastEpisode.updateMany({
        where: {
          episodeId: { in: episodeIds },
          publishedJobId: { not: null },
          status: 'generating',
        },
        data: {
          status: 'ready',
          errorMessage: null,
        },
      }),
      this.prisma.personalPodcast.updateMany({
        where: { status: { in: activePersonalPodcastStatuses } },
        data: {
          status: 'failed',
          statusMessage: 'Generation interrupted',
          errorMessage: interruptedMessage,
          completedAt: now,
        },
      }),
    ]);

    if (interruptedJobs.length > 0 || personalPodcasts.count > 0) {
      this.logger.warn(
        `Recovered ${interruptedJobs.length} interrupted class job(s) and ${personalPodcasts.count} personal podcast job(s)`,
      );
    }
  }
}

