import { PodcastTurn } from './podcast-generation.types';

export const PRESET_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type PresetVoice = (typeof PRESET_VOICES)[number];
export type VoiceMode = 'preset' | 'custom';

export interface VoiceProfile {
  mode: VoiceMode;
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

export interface EpisodeDraftInput {
  summary?: string;
  durationTargetMinutes?: number;
  turns: PodcastTurn[];
}

export interface UpdateManagedEpisodeInput {
  title?: string;
  draft?: EpisodeDraftInput;
  voiceOverrides?: EpisodeVoiceOverrides;
}
