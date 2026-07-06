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
