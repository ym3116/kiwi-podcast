import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { InterruptedJobRecoveryService } from './interrupted-job-recovery.service';

describe('InterruptedJobRecoveryService', () => {
  it('fails orphaned jobs and restores episodes with an existing publication', async () => {
    const generationJob = {
      findMany: vi.fn().mockResolvedValue([
        { episodeId: 'episode-1' },
        { episodeId: 'episode-1' },
        { episodeId: 'episode-2' },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    };
    const podcastEpisode = {
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 }),
    };
    const personalPodcast = {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    };
    const prisma = {
      generationJob,
      podcastEpisode,
      personalPodcast,
      $transaction: vi.fn().mockImplementation((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new InterruptedJobRecoveryService(prisma as unknown as PrismaService);

    await service.onApplicationBootstrap();

    expect(generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'generating' },
        data: expect.objectContaining({ status: 'failed', finishedAt: expect.any(Date) }),
      }),
    );
    expect(podcastEpisode.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          episodeId: { in: ['episode-1', 'episode-2'] },
          publishedJobId: null,
        }),
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
    expect(podcastEpisode.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          episodeId: { in: ['episode-1', 'episode-2'] },
          publishedJobId: { not: null },
        }),
        data: { status: 'ready', errorMessage: null },
      }),
    );
    expect(personalPodcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', completedAt: expect.any(Date) }),
      }),
    );
  });
});

