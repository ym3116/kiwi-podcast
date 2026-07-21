import { describe, expect, it, vi } from 'vitest';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { PodcastGenerationService } from './podcast-generation.service';
import { ScriptGeneratorService } from './script-generator.service';
import { AudioProductionService } from './audio-production.service';

describe('PodcastGenerationService', () => {
  it('moves a job through generating to ready', async () => {
    const store = inMemoryStore();
    const service = new PodcastGenerationService(
      {
        getChunks: vi.fn().mockResolvedValue({
          classId: 'class-1',
          documentId: 'doc-1',
          documentName: 'Loops',
          chunks: [{ text: 'Loops repeat work.' }],
        }),
      },
      store as unknown as PodcastArtifactStore,
      {
        generate: vi.fn().mockResolvedValue({
          title: 'Loops podcast',
          summary: 'Summary',
          durationTargetMinutes: 5,
          turns: [{ speaker: 'HOST_A', text: 'Welcome.' }],
        }),
      } as unknown as ScriptGeneratorService,
      { produce: vi.fn().mockResolvedValue(Buffer.from([1])) } as unknown as AudioProductionService,
    );

    const result = await service.generate('class-1', 'doc-1');

    expect(store.statuses).toEqual(['generating', 'ready']);
    expect(result.job.status).toBe('ready');
    expect(result.episode?.audioUrl).toContain('/api/podcast/audio/episode-doc-1');
  });

  it('marks failed jobs when generation throws', async () => {
    const store = inMemoryStore();
    const service = new PodcastGenerationService(
      {
        getChunks: vi.fn().mockRejectedValue(new Error('missing chunks')),
      },
      store as unknown as PodcastArtifactStore,
      {} as ScriptGeneratorService,
      {} as AudioProductionService,
    );

    const result = await service.generate('class-1', 'doc-1');

    expect(store.statuses).toEqual(['generating', 'failed']);
    expect(result.job).toMatchObject({ status: 'failed', errorMessage: 'missing chunks' });
  });

  it('reuses an active generation job instead of starting duplicate work', async () => {
    const store = inMemoryStore();
    store.nextBeginStarted = false;
    const getChunks = vi.fn();
    const service = new PodcastGenerationService(
      { getChunks },
      store as unknown as PodcastArtifactStore,
      {} as ScriptGeneratorService,
      {} as AudioProductionService,
    );

    const result = await service.generate('class-1', 'doc-1');

    expect(result.job).toMatchObject({ status: 'generating' });
    expect(getChunks).not.toHaveBeenCalled();
    expect(store.statuses).toEqual([]);
  });
});

function inMemoryStore() {
  const jobs = new Map<string, any>();
  const scripts = new Map<string, any>();
  const statuses: string[] = [];
  const store = {
    statuses,
    nextBeginStarted: true,
    readJob: vi.fn(async (episodeId: string) => jobs.get(episodeId) ?? null),
    beginJob: vi.fn(async (episodeId: string, patch: any) => {
      const job = {
        episodeId,
        classId: patch.classId,
        documentId: patch.documentId,
        status: 'generating',
        updatedAt: new Date().toISOString(),
      };
      jobs.set(episodeId, job);
      if (!store.nextBeginStarted) {
        return { job, started: false };
      }
      statuses.push('generating');
      return { job, started: true };
    }),
    markJob: vi.fn(async (episodeId: string, patch: any) => {
      const job = {
        episodeId,
        ...(jobs.get(episodeId) ?? {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      jobs.set(episodeId, job);
      if (patch.status) {
        statuses.push(patch.status);
      }
      return job;
    }),
    writeScript: vi.fn(async (episodeId: string, script: any) => {
      scripts.set(episodeId, script);
      return { scriptPath: `/scripts/${episodeId}.json` };
    }),
    readScript: vi.fn(async (episodeId: string) => scripts.get(episodeId) ?? null),
    writeAudio: vi.fn(async (episodeId: string) => ({ storageKey: `class-episodes/${episodeId}.mp3` })),
    audioStorageKey: vi.fn(async (episodeId: string) => `class-episodes/${episodeId}.mp3`),
  };
  return store;
}
