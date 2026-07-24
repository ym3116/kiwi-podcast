import { describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PodcastGenerationService } from './podcast-generation.service';
import { PodcastService } from './podcast.service';

function generationServiceMock() {
  return {
    syncPodcastCatalog: vi.fn(async () => undefined),
    overlayEpisode: vi.fn(async (_classId, episode) => ({
      ...episode,
      status: 'ready',
      audioUrl: `/api/podcast/classes/class-1/audio/${episode.id}`,
    })),
  } as unknown as PodcastGenerationService;
}

describe('PodcastService', () => {
  it('reads class materials first', async () => {
    const mcpClient = {
      readResource: vi.fn().mockResolvedValue({
        className: 'Algorithms',
        materials: { documents: [{ id: 'doc-1', fileName: 'graphs.pdf', materialType: 'lecture' }] },
      }),
    };

    const service = new PodcastService(
      mcpClient as unknown as KiwiMcpClient,
      generationServiceMock(),
    );
    const result = await service.getClassPodcast('class-1', 'token');

    expect(mcpClient.readResource).toHaveBeenCalledWith(
      'token',
      'kiwi://class/class-1/materials',
    );
    expect(result.episodes[0].title).toBe('Lecture 1 - graphs');
  });

  it('falls back to class documents when materials resource is unavailable', async () => {
    const mcpClient = {
      readResource: vi
        .fn()
        .mockRejectedValueOnce(new Error('Unknown resource: class materials'))
        .mockResolvedValueOnce({
          documents: [{ id: 'doc-1', fileName: 'recursion.pdf', materialType: 'lecture' }],
        }),
    };

    const service = new PodcastService(
      mcpClient as unknown as KiwiMcpClient,
      generationServiceMock(),
    );
    const result = await service.getClassPodcast('class-1', 'token');

    expect(mcpClient.readResource).toHaveBeenNthCalledWith(
      2,
      'token',
      'kiwi://class/class-1/documents',
    );
    expect(result.episodes[0].title).toBe('Lecture 1 - recursion');
  });

  it('does not hide access-denied errors behind fallback behavior', async () => {
    const mcpClient = {
      readResource: vi.fn().mockRejectedValue(new Error('Access denied to class materials')),
    };

    const service = new PodcastService(
      mcpClient as unknown as KiwiMcpClient,
      generationServiceMock(),
    );

    await expect(service.getClassPodcast('class-1', 'token')).rejects.toThrow(
      'Access denied to class materials',
    );
  });

  it('syncs every lecture but returns only published episodes in the class feed', async () => {
    const mcpClient = {
      readResource: vi.fn().mockResolvedValue({
        className: 'Algorithms',
        materials: {
          documents: [
            { id: 'doc-published', fileName: 'graphs.pdf', materialType: 'lecture' },
            { id: 'doc-unpublished', fileName: 'sorting.pdf', materialType: 'lecture' },
          ],
        },
      }),
    };
    const generation = {
      syncPodcastCatalog: vi.fn(async () => undefined),
      overlayEpisode: vi.fn(async (_classId, episode) =>
        episode.documentId === 'doc-published'
          ? {
              ...episode,
              status: 'ready',
              audioUrl: `/api/podcast/classes/class-1/audio/${episode.id}`,
            }
          : {
              ...episode,
              title: 'Private draft title',
              status: 'placeholder',
              audioUrl: undefined,
            },
      ),
    };
    const service = new PodcastService(
      mcpClient as unknown as KiwiMcpClient,
      generation as unknown as PodcastGenerationService,
    );

    const result = await service.getClassPodcast('class-1', 'token');

    expect(generation.syncPodcastCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        episodes: expect.arrayContaining([
          expect.objectContaining({ documentId: 'doc-published' }),
          expect.objectContaining({ documentId: 'doc-unpublished' }),
        ]),
      }),
    );
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]).toMatchObject({
      documentId: 'doc-published',
      status: 'ready',
    });
    expect(JSON.stringify(result)).not.toContain('Private draft title');
    expect(JSON.stringify(result)).not.toContain('doc-unpublished');
  });
});
