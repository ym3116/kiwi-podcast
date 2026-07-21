import { PersonalPodcast, PodcastEpisode, PodcastSummary } from './podcast';

export type PodcastSource = 'class' | 'personal';

export interface TranscriptTurn {
  speaker?: string;
  text: string;
}

export interface PodcastViewItem {
  source: PodcastSource;
  id: string;
  title: string;
  summary: string;
  eyebrow: string;
  sourceLabel: string;
  durationLabel: string;
  artLabel: string;
  status: PodcastEpisode['status'] | PersonalPodcast['status'];
  statusLabel: string;
  audioUrl?: string;
  transcript: TranscriptTurn[];
  materials: string[];
  progressPercent?: number;
  statusMessage?: string;
  errorMessage?: string;
}

export function podcastViewKey(item: Pick<PodcastViewItem, 'source' | 'id'>): string {
  return `${item.source}:${item.id}`;
}

function speakerLabel(speaker: string): string {
  const normalized = speaker.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'HOST_A' || normalized === 'HOST_1') return 'Host A';
  if (normalized === 'HOST_B' || normalized === 'HOST_2') return 'Host B';
  return speaker.trim();
}

export function parseClassTranscript(script: string): TranscriptTurn[] {
  const normalized = script.replace(/\s+/g, ' ').trim();
  const speakerPattern = /(?:^|\s)(HOST[_ ]?[AB12]|SPEAKER[_ ]?\d+):\s*/gi;
  const matches = [...normalized.matchAll(speakerPattern)];

  if (matches.length > 0) {
    return matches.map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? normalized.length;
      return {
        speaker: speakerLabel(match[1]),
        text: normalized.slice(start, end).trim(),
      };
    }).filter((turn) => turn.text.length > 0);
  }

  return script
    .split(/\n\s*\n|\n/)
    .map((paragraph) => ({ text: paragraph.trim() }))
    .filter((turn) => turn.text.length > 0);
}

function conciseDescription(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength + 1);
  const wordBoundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, wordBoundary > maxLength * 0.7 ? wordBoundary : maxLength).trim()}…`;
}

export function classEpisodeView(
  podcast: PodcastSummary,
  episode: PodcastEpisode,
): PodcastViewItem {
  const transcript = parseClassTranscript(episode.script);
  return {
    source: 'class',
    id: episode.id,
    title: episode.title,
    summary: conciseDescription(
      transcript[0]?.text || `A class podcast grounded in ${episode.documentName}.`,
    ),
    eyebrow: `Lecture ${episode.lectureNumber}`,
    sourceLabel: podcast.title,
    durationLabel: episode.durationLabel,
    artLabel: String(episode.lectureNumber),
    status: episode.status,
    statusLabel: episode.status === 'ready' ? 'Ready' : episode.status === 'failed' ? 'Failed' : 'Generate audio',
    audioUrl: episode.audioUrl,
    transcript,
    materials: [episode.documentName],
    errorMessage: episode.errorMessage,
  };
}

export function personalPodcastView(podcast: PersonalPodcast): PodcastViewItem {
  return {
    source: 'personal',
    id: podcast.id,
    title: podcast.title,
    summary: podcast.summary || podcast.prompt,
    eyebrow: 'Made for you',
    sourceLabel: 'My Podcasts',
    durationLabel: `${podcast.durationMinutes} min`,
    artLabel: 'MY',
    status: podcast.status,
    statusLabel: podcast.status.replace(/_/g, ' '),
    audioUrl: podcast.audioUrl,
    transcript: (podcast.turns ?? []).map((turn) => ({
      speaker: speakerLabel(turn.speaker),
      text: turn.text,
    })),
    materials: podcast.selectedMaterials.map((material) => material.documentName),
    progressPercent: podcast.progressPercent,
    statusMessage: podcast.statusMessage,
    errorMessage: podcast.errorMessage,
  };
}
