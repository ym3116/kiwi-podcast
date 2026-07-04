import { PodcastResponse } from '../types/podcast';

const apiBase = () => (import.meta.env.VITE_PODCAST_API_BASE || 'http://localhost:8010').replace(/\/$/, '');

export async function fetchClassPodcast(
  classId: string,
  accessToken: string,
): Promise<PodcastResponse> {
  const response = await fetch(`${apiBase()}/api/podcast/classes/${encodeURIComponent(classId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Podcast API returned ${response.status}`);
  }

  return body as PodcastResponse;
}
