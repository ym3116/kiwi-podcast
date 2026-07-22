import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PodcastManagementService } from './podcast-management.service';

describe('PodcastManagementService', () => {
  it('increments the draft revision only when script or voice content changes', async () => {
    const prisma = basePrisma();
    prisma.podcastEpisode.findFirstOrThrow.mockResolvedValue(episode());
    const service = management(prisma);

    await service.updateEpisode('class-1', 'doc-1', {
      draft: { summary: 'Summary', durationTargetMinutes: 10, turns: turns() },
      voiceOverrides: {},
    });
    expect(prisma.podcastEpisode.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ draftRevision: expect.anything() }),
    }));

    await service.updateEpisode('class-1', 'doc-1', {
      draft: { summary: 'Changed', durationTargetMinutes: 10, turns: turns() },
    });
    expect(prisma.podcastEpisode.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ draftRevision: { increment: 1 } }),
    }));
  });

  it('invalidates only episodes whose effective class voice changes', async () => {
    const prisma = basePrisma();
    const overridden = settings('onyx', 'nova');
    prisma.podcastClass.findUniqueOrThrow.mockResolvedValue({
      voiceDefaults: settings('alloy', 'echo'),
      documents: [
        { episode: { id: 'inherits', voiceOverrides: null } },
        { episode: { id: 'overridden', voiceOverrides: overridden } },
      ],
    });
    const service = management(prisma);

    await service.updateDefaults('class-1', settings('shimmer', 'fable'));

    expect(prisma.podcastEpisode.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inherits'] } },
      data: { draftRevision: { increment: 1 } },
    });
  });

  it('rejects a stale render and switches publication only to a current ready job', async () => {
    const prisma = basePrisma();
    prisma.podcastEpisode.findFirstOrThrow.mockResolvedValue(episode());
    prisma.generationJob.findUnique.mockResolvedValue({
      id: 'job-1', episodeId: 'episode-doc-1', classId: 'class-1', status: 'ready',
      draftRevision: 2, audioAsset: {}, script: {}, finishedAt: new Date('2026-07-21T00:00:00Z'),
    });
    const service = management(prisma);

    await expect(service.publish('class-1', 'doc-1', 'job-1')).rejects.toBeInstanceOf(ConflictException);
    prisma.generationJob.findUnique.mockResolvedValue({
      id: 'job-1', episodeId: 'episode-doc-1', classId: 'class-1', status: 'ready',
      draftRevision: 3, audioAsset: {}, script: {}, finishedAt: new Date('2026-07-21T00:00:00Z'),
    });
    await expect(service.publish('class-1', 'doc-1', 'job-1')).resolves.toEqual({ published: true, jobId: 'job-1' });
    expect(prisma.podcastEpisode.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedJobId: 'job-1' }),
    }));
  });

  it('deletes generated artifacts while retaining editable episode configuration', async () => {
    const prisma = basePrisma();
    prisma.podcastEpisode.findFirstOrThrow.mockResolvedValue(episode());
    prisma.generationJob.findFirst.mockResolvedValue(null);
    prisma.podcastAudioAsset.findMany.mockResolvedValue([{ storageKey: 'class-episodes/e/job.mp3' }]);
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === 'function') return operation(prisma);
      return Array.isArray(operation) ? Promise.all(operation) : undefined;
    });
    const service = management(prisma, storage);

    await service.resetEpisode('class-1', 'doc-1');

    expect(storage.delete).toHaveBeenCalledWith('class-episodes/e/job.mp3');
    const reset = prisma.podcastEpisode.update.mock.calls.at(-1)?.[0].data;
    expect(reset).toEqual({ publishedJobId: null, status: 'placeholder', generatedAt: null, errorMessage: null });
    expect(reset).not.toHaveProperty('titleOverride');
    expect(reset).not.toHaveProperty('draftTurns');
    expect(reset).not.toHaveProperty('voiceOverrides');
    expect(prisma.generationJob.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode-doc-1' } });
  });
});

function management(prisma: ReturnType<typeof basePrisma>, storage: { delete: ReturnType<typeof vi.fn> } = { delete: vi.fn() }) {
  return new PodcastManagementService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    storage as never,
    { defaultVoiceSettings: () => settings('alloy', 'echo') } as never,
  );
}

function basePrisma() {
  const prisma = {
    podcastClass: { findUniqueOrThrow: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    podcastEpisode: {
      findFirstOrThrow: vi.fn(), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}),
    },
    generationJob: { findUnique: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn().mockResolvedValue({}) },
    podcastAudioAsset: { findMany: vi.fn() },
    $transaction: vi.fn(async (operations: unknown) => Array.isArray(operations) ? Promise.all(operations) : undefined),
  };
  return prisma;
}

function episode() {
  return {
    id: 'row-1', episodeId: 'episode-doc-1', classId: 'class-1', kiwiDocumentId: 'doc-1',
    title: 'Lecture 1', titleOverride: 'Custom title', draftSummary: 'Summary',
    draftDurationTargetMinutes: 10, draftTurns: turns(), draftRevision: 3, voiceOverrides: {},
    sourceDocument: { documentName: 'Canonical Kiwi document', materialType: 'lecture' },
  };
}

function turns() {
  return [{ speaker: 'HOST_A' as const, text: 'Hello.' }];
}

function settings(hostVoice: 'alloy' | 'onyx' | 'shimmer', speakerVoice: 'echo' | 'nova' | 'fable') {
  return {
    host: { mode: 'preset' as const, voice: hostVoice, description: 'Host voice', seed: 1, referenceText: 'Hello there.' },
    speaker: { mode: 'preset' as const, voice: speakerVoice, description: 'Speaker voice', seed: 2, referenceText: 'Nice to meet you.' },
  };
}
