export interface PodcastSummary {
  id: string;
  classId: string;
  title: string;
  description: string;
  coverTheme: string;
}

export interface PodcastTranscriptTurn {
  speaker: 'HOST_A' | 'HOST_B';
  text: string;
  startSeconds?: number;
  endSeconds?: number;
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
  transcript?: PodcastTranscriptTurn[];
  status: 'placeholder' | 'generating' | 'ready' | 'failed';
  audioUrl?: string;
  generatedAt?: string;
  errorMessage?: string;
}

export interface PodcastResponse {
  podcast: PodcastSummary;
  episodes: PodcastEpisode[];
}

export interface KiwiDocument {
  id?: string;
  documentId?: string;
  fileName?: string;
  documentName?: string;
  materialType?: string;
}

export interface KiwiMaterialsPayload {
  classId?: string;
  className?: string;
  name?: string;
  description?: string;
  materials?: {
    documents?: KiwiDocument[];
    totalCount?: number;
  };
  documents?: KiwiDocument[];
  totalDocuments?: number;
  error?: string;
}
