import { describe, expect, it, vi } from 'vitest';
import { PodcastArtifactStore } from './podcast-artifact.store';
import { PodcastGenerationService } from './podcast-generation.service';
import { ScriptGeneratorService } from './script-generator.service';
import { TtsService } from './tts.service';

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
      { synthesize: vi.fn().mockResolvedValue(Buffer.from([1])) } as unknown as TtsService,
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
      {} as TtsService,
    );

    const result = await service.generate('class-1', 'doc-1');

    expect(store.statuses).toEqual(['generating', 'failed']);
    expect(result.job).toMatchObject({ status: 'failed', errorMessage: 'missing chunks' });
  });
});

function inMemoryStore() {
  const jobs = new Map<string, any>();
  const scripts = new Map<string, any>();
  const statuses: string[] = [];
  return {
    statuses,
    readJob: vi.fn(async (episodeId: string) => jobs.get(episodeId) ?? null),
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
    writeAudio: vi.fn(async (episodeId: string) => ({ audioPath: `/audio/${episodeId}.mp3` })),
    audioPath: vi.fn((episodeId: string) => `/audio/${episodeId}.mp3`),
  };
}
