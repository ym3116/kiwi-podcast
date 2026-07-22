import {
  DemoMaterial,
  EpisodeVoiceOverrides,
  PersonalPodcast,
  PodcastDifficulty,
  PodcastManagementState,
  PodcastResponse,
  PodcastVoiceSettings,
  VoiceProfile,
} from '../types/podcast';

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

export async function deleteMyPodcast(classId: string, podcastId: string, userId: string, token: string) {
  return apiJson<{ deleted: true; id: string }>(
    `/api/podcast/classes/${encodeURIComponent(classId)}/my-podcasts/${encodeURIComponent(podcastId)}`,
    token,
    { method: 'DELETE', body: JSON.stringify({ ownerUserId: userId }) },
  );
}

const managePath = (classId: string) => `/api/podcast/classes/${encodeURIComponent(classId)}/manage`;

export async function fetchPodcastManagement(classId: string, token: string) {
  const response = await fetch(`${apiBase()}${managePath(classId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 403 || response.status === 401) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Management API returned ${response.status}`);
  return body as PodcastManagementState;
}

export function updatePodcastDefaults(classId: string, token: string, defaults: PodcastVoiceSettings) {
  return apiJson<PodcastVoiceSettings>(`${managePath(classId)}/defaults`, token, {
    method: 'PATCH', body: JSON.stringify(defaults),
  });
}

export function updateManagedEpisode(
  classId: string,
  documentId: string,
  token: string,
  input: {
    title?: string;
    draft?: { summary?: string; durationTargetMinutes?: number; turns: Array<{ speaker: 'HOST_A' | 'HOST_B'; text: string }> };
    voiceOverrides?: EpisodeVoiceOverrides;
  },
) {
  return apiJson<{ saved: true }>(`${managePath(classId)}/episodes/${encodeURIComponent(documentId)}`, token, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export function generateManagedDraft(classId: string, documentId: string, token: string) {
  return apiJson(`${managePath(classId)}/episodes/${encodeURIComponent(documentId)}/draft/generate`, token, { method: 'POST' });
}

export function renderManagedEpisode(classId: string, documentId: string, token: string) {
  return apiJson(`${managePath(classId)}/episodes/${encodeURIComponent(documentId)}/render`, token, { method: 'POST' });
}

export function publishManagedEpisode(classId: string, documentId: string, jobId: string, token: string) {
  return apiJson(`${managePath(classId)}/episodes/${encodeURIComponent(documentId)}/publish`, token, {
    method: 'POST', body: JSON.stringify({ jobId }),
  });
}

export function deleteManagedEpisode(classId: string, documentId: string, token: string) {
  return apiJson(`${managePath(classId)}/episodes/${encodeURIComponent(documentId)}`, token, { method: 'DELETE' });
}

export async function previewManagedVoice(classId: string, profile: VoiceProfile, token: string) {
  const response = await fetch(`${apiBase()}${managePath(classId)}/voice-preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Voice preview returned ${response.status}`);
  }
  return response.blob();
}

export async function fetchManagedPreviewAudio(classId: string, jobId: string, token: string) {
  const response = await fetch(`${apiBase()}${managePath(classId)}/jobs/${encodeURIComponent(jobId)}/audio`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Preview audio returned ${response.status}`);
  return response.blob();
}
