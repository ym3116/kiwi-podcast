export interface PodcastSummary {
  id: string;
  classId: string;
  title: string;
  description: string;
  coverTheme: string;
}

export interface PodcastEpisode {
  id: string;
  documentId: string;
  title: string;
  lectureNumber: number;
  documentName: string;
  materialType: string;
  durationLabel: string;
  script: string;
  status: 'placeholder' | 'generating' | 'ready' | 'failed';
  audioUrl?: string;
  generatedAt?: string;
  errorMessage?: string;
}

export interface PodcastResponse {
  podcast: PodcastSummary;
  episodes: PodcastEpisode[];
}

export interface DemoMaterial {
  id: string;
  documentId: string;
  documentName: string;
  materialId?: string;
  materialType: string;
  chunkCount: number;
  pageCount?: number;
  preview: string;
}

export type PodcastDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type PersonalPodcastStatus =
  | 'queued'
  | 'preparing_materials'
  | 'generating_script'
  | 'validating_script'
  | 'generating_audio'
  | 'saving'
  | 'ready'
  | 'failed';

export interface PersonalPodcast {
  id: string;
  classId: string;
  ownerUserId: string;
  prompt: string;
  title: string;
  summary: string;
  durationMinutes: number;
  difficulty: PodcastDifficulty;
  status: PersonalPodcastStatus;
  progressPercent: number;
  statusMessage: string;
  selectedMaterials: DemoMaterial[];
  turns?: Array<{ speaker: 'HOST_A' | 'HOST_B'; text: string }>;
  audioUrl?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const presetVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type PresetVoice = (typeof presetVoices)[number];

export interface VoiceProfile {
  mode: 'preset' | 'custom';
  voice: PresetVoice;
  description: string;
  seed: number;
  referenceText: string;
}

export interface PodcastVoiceSettings {
  host: VoiceProfile;
  speaker: VoiceProfile;
}

export interface EpisodeVoiceOverrides {
  host?: VoiceProfile;
  speaker?: VoiceProfile;
}

export interface ManagedRender {
  jobId: string;
  status: PodcastEpisode['status'];
  progressPercent: number;
  statusMessage: string;
  errorMessage?: string | null;
  draftRevision?: number | null;
  durationSeconds?: number | null;
  generatedAt?: string | null;
  previewAvailable: boolean;
}

export interface ManagedEpisode {
  documentId: string;
  documentName: string;
  materialType: string;
  title: string;
  draft: {
    summary: string;
    turns: Array<{ speaker: 'HOST_A' | 'HOST_B'; text: string }>;
    revision: number;
  };
  voiceOverrides: EpisodeVoiceOverrides;
  effectiveVoices: PodcastVoiceSettings;
  published: { jobId: string; generatedAt: string; durationSeconds?: number | null; audioUrl: string } | null;
  latestRender: ManagedRender | null;
}

export interface PodcastManagementState {
  classId: string;
  className: string;
  defaults: PodcastVoiceSettings;
  episodes: ManagedEpisode[];
}
