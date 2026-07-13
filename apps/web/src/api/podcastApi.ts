import { DemoMaterial, PersonalPodcast, PodcastDifficulty, PodcastEpisode, PodcastResponse } from '../types/podcast';

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

async function apiJson<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.errorMessage || `Podcast API returned ${response.status}`);
  return body as T;
}

export async function fetchCreatorMaterials(classId: string, token: string) {
  return apiJson<{ materials: DemoMaterial[] }>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/creator/materials`,
    token,
  );
}

export async function fetchMyPodcasts(classId: string, userId: string, token: string) {
  return apiJson<{ podcasts: PersonalPodcast[] }>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/my-podcasts?ownerUserId=${encodeURIComponent(userId)}`,
    token,
  );
}

export async function fetchMyPodcast(classId: string, podcastId: string, userId: string, token: string) {
  return apiJson<PersonalPodcast>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/my-podcasts/${encodeURIComponent(podcastId)}?ownerUserId=${encodeURIComponent(userId)}`,
    token,
  );
}

export async function createMyPodcast(
  classId: string,
  token: string,
  input: { ownerUserId: string; prompt: string; materialIds: string[]; durationMinutes: 5 | 10 | 15; difficulty: PodcastDifficulty },
) {
  return apiJson<PersonalPodcast>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/my-podcasts`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function retryMyPodcast(classId: string, podcastId: string, userId: string, token: string) {
  return apiJson<PersonalPodcast>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/my-podcasts/${encodeURIComponent(podcastId)}/retry`,
    token,
    { method: 'POST', body: JSON.stringify({ ownerUserId: userId }) },
  );
}

export async function generatePodcastEpisode(
  classId: string,
  documentId: string,
  accessToken: string,
): Promise<{ episode?: PodcastEpisode; job: PodcastEpisodeJob }> {
  const response = await fetch(
    `${apiBase()}/api/podcast/classes/${encodeURIComponent(classId)}/episodes/${encodeURIComponent(documentId)}/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.errorMessage || body?.error || `Generate returned ${response.status}`);
  }

  return body as { episode?: PodcastEpisode; job: PodcastEpisodeJob };
}

interface PodcastEpisodeJob {
  episodeId: string;
  classId: string;
  documentId: string;
  status: PodcastEpisode['status'];
  audioUrl?: string;
  generatedAt?: string;
  errorMessage?: string;
}
