import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMyPodcast,
  deleteMyPodcast,
  fetchPodcastAdminClasses,
  fetchPodcastGlobalDefaults,
  fetchMyPodcast,
  fetchMyPodcasts,
  fetchPodcastAudio,
  retryMyPodcast,
  updatePodcastGlobalDefaults,
} from './podcastApi';

describe('podcast API ownership and media requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send a client-controlled owner ID in personal routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ podcasts: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMyPodcasts('class-1', 'token');
    await fetchMyPodcast('class-1', 'podcast-1', 'token');
    await retryMyPodcast('class-1', 'podcast-1', 'token');
    await deleteMyPodcast('class-1', 'podcast-1', 'token');

    for (const [input, init] of fetchMock.mock.calls) {
      expect(String(input)).not.toContain('ownerUserId');
      expect(JSON.stringify(init ?? {})).not.toContain('ownerUserId');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' });
    }
  });

  it('does not include an owner ID when creating a personal podcast', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'podcast-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await createMyPodcast('class-1', 'token', {
      prompt: 'Explain the current lecture',
      materialIds: ['doc-1'],
      durationMinutes: 5,
      difficulty: 'intermediate',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('ownerUserId');
  });

  it('downloads protected audio with the Kiwi bearer token', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPodcastAudio('/api/podcast/classes/class-1/audio/episode-1', 'token'),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8010/api/podcast/classes/class-1/audio/episode-1',
      { headers: { Authorization: 'Bearer token' } },
    );
  });

  it('never forwards the Kiwi token to an unexpected audio origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPodcastAudio('https://attacker.example/api/podcast/audio.mp3', 'secret-token'),
    ).rejects.toThrow('untrusted audio URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the classless admin endpoints without adding a class ID', async () => {
    const defaults = {
      host: { mode: 'preset' as const, voice: 'nova' as const, description: 'Host', seed: 1, referenceText: 'Hello.' },
      speaker: { mode: 'preset' as const, voice: 'onyx' as const, description: 'Speaker', seed: 2, referenceText: 'Welcome.' },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ defaults, source: 'saved', updatedAt: null }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPodcastGlobalDefaults('admin-token');
    await fetchPodcastAdminClasses('admin-token');
    await updatePodcastGlobalDefaults('admin-token', defaults);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8010/api/podcast/admin/defaults');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer admin-token' });
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8010/api/podcast/admin/classes');
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer admin-token' });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PATCH' });
    expect(String(fetchMock.mock.calls[2][0])).not.toContain('/classes/');
  });

  it('surfaces the API authorization message instead of the generic status label', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Missing required podcast scope: podcast:manage',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPodcastGlobalDefaults('admin-token')).rejects.toThrow(
      'Missing required podcast scope: podcast:manage',
    );
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}
