import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMyPodcast,
  deleteMyPodcast,
  fetchMyPodcast,
  fetchMyPodcasts,
  fetchPodcastAudio,
  retryMyPodcast,
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
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}
