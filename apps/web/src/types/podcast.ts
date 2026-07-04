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
