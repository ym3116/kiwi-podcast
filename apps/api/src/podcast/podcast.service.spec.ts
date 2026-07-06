import { describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PodcastService } from './podcast.service';

describe('PodcastService', () => {
  it('reads class materials first', async () => {
    const mcpClient = {
      readResource: vi.fn().mockResolvedValue({
        className: 'Algorithms',
        materials: { documents: [{ id: 'doc-1', fileName: 'graphs.pdf', materialType: 'lecture' }] },
      }),
    };

    const service = new PodcastService(mcpClient as unknown as KiwiMcpClient);
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

    const service = new PodcastService(mcpClient as unknown as KiwiMcpClient);
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

    const service = new PodcastService(mcpClient as unknown as KiwiMcpClient);

    await expect(service.getClassPodcast('class-1', 'token')).rejects.toThrow(
      'Access denied to class materials',
    );
  });
});
