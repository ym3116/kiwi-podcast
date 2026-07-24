import { describe, expect, it, vi } from 'vitest';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { PodcastGenerationService } from './podcast-generation.service';
import { ScriptGeneratorService } from './script-generator.service';
import { AudioProductionService } from './audio-production.service';

describe('PodcastGenerationService', () => {
  it('moves a job through generating to ready', async () => {
    const store = inMemoryStore();
    const getChunks = vi.fn().mockResolvedValue({
      classId: 'class-1',
      documentId: 'doc-1',
      documentName: 'Loops',
      chunks: [{ text: 'Loops repeat work.' }],
    });
    const service = new PodcastGenerationService(
      { getChunks } as never,
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

    const result = await service.generate('class-1', 'doc-1', 'token');

    expect(store.statuses).toEqual(['generating', 'ready']);
    expect(getChunks).toHaveBeenCalledWith('class-1', 'doc-1', 'token');
    expect(result.job.status).toBe('ready');
    expect(result.episode?.audioUrl).toContain(
      '/api/podcast/classes/class-1/audio/episode-doc-1',
    );
  });

  it('marks failed jobs when generation throws', async () => {
    const store = inMemoryStore();
    const service = new PodcastGenerationService(
      {
        getChunks: vi.fn().mockRejectedValue(new Error('missing chunks')),
      } as never,
      store as unknown as PodcastArtifactStore,
      {} as ScriptGeneratorService,
      {} as AudioProductionService,
    );

    const result = await service.generate('class-1', 'doc-1', 'token');

    expect(store.statuses).toEqual(['generating', 'failed']);
    expect(result.job).toMatchObject({ status: 'failed', errorMessage: 'missing chunks' });
  });

  it('reuses an active generation job instead of starting duplicate work', async () => {
    const store = inMemoryStore();
    store.nextBeginStarted = false;
    const getChunks = vi.fn();
    const service = new PodcastGenerationService(
      { getChunks } as never,
      store as unknown as PodcastArtifactStore,
      {} as ScriptGeneratorService,
      {} as AudioProductionService,
    );

    const result = await service.generate('class-1', 'doc-1', 'token');

    expect(result.job).toMatchObject({ status: 'generating' });
    expect(getChunks).not.toHaveBeenCalled();
    expect(store.statuses).toEqual([]);
  });

  it('shows the measured render duration for a published episode', async () => {
    const artifacts = {
      readPublishedJob: vi.fn().mockResolvedValue({
        id: 'job-1', episodeId: 'episode-doc-1', classId: 'class-1', documentId: 'doc-1',
        status: 'ready', durationSeconds: 95, audioUrl: '/audio', updatedAt: '2026-07-22T00:00:00Z',
      }),
      titleOverride: vi.fn().mockResolvedValue(null),
      readScriptForJob: vi.fn().mockResolvedValue({
        title: 'Measured episode', summary: 'Summary', durationTargetMinutes: 20,
        turns: [{ speaker: 'HOST_A', text: 'Welcome.' }],
      }),
    };
    const service = new PodcastGenerationService(
      {} as never,
      artifacts as unknown as PodcastArtifactStore,
      {} as never,
      {} as never,
    );

    const episode = await service.overlayEpisode('class-1', {
      id: 'episode-doc-1', documentId: 'doc-1', title: 'Episode', lectureNumber: 1,
      documentName: 'Lecture', materialType: 'lecture', durationLabel: 'Not published', script: '', status: 'placeholder',
    });

    expect(episode.durationLabel).toBe('1:35');
  });
});

function inMemoryStore() {
  const jobs = new Map<string, any>();
  const scripts = new Map<string, any>();
  const statuses: string[] = [];
  const store = {
    statuses,
    nextBeginStarted: true,
    readJob: vi.fn(async (_classId: string, episodeId: string) => jobs.get(episodeId) ?? null),
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
