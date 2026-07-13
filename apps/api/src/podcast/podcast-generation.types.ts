import { PodcastEpisode } from '../types/podcast';

export type PodcastJobStatus = PodcastEpisode['status'];

export interface PodcastChunk {
  text: string;
  pageNumber?: string;
  documentId?: string;
  documentName?: string;
}

export type PodcastDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface PersonalPodcastScriptInput extends PodcastChunkInput {
  prompt: string;
  durationMinutes: 5 | 10 | 15;
  difficulty: PodcastDifficulty;
}

export interface PodcastChunkInput {
  classId: string;
  documentId: string;
  documentName: string;
  chunks: PodcastChunk[];
}

export interface PodcastTurn {
  speaker: 'HOST_A' | 'HOST_B';
  text: string;
}

export interface GeneratedPodcastScript {
  title: string;
  summary: string;
  durationTargetMinutes: number;
  turns: PodcastTurn[];
}

export interface PodcastJob {
  episodeId: string;
  classId: string;
  documentId: string;
  status: PodcastJobStatus;
  scriptPath?: string;
  audioPath?: string;
  audioUrl?: string;
  generatedAt?: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface GeneratePodcastResult {
  job: PodcastJob;
  episode?: PodcastEpisode;
}
