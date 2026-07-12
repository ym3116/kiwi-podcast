import { ArrowLeft, AlertCircle, Clock, FileText, Loader2, Pause, Play } from 'lucide-react';
import { PodcastEpisode, PodcastSummary } from '../types/podcast';
import { PodcastCover } from './PodcastCover';

interface EpisodeDetailProps {
  podcast: PodcastSummary;
  episode: PodcastEpisode;
  durationLabel: string;
  isPlaying: boolean;
  isGenerating: boolean;
  generationError: string | null;
  onBack: () => void;
  onTogglePlay: () => void | Promise<void>;
}

export function EpisodeDetail({
  podcast,
  episode,
  durationLabel,
  isPlaying,
  isGenerating,
  generationError,
  onBack,
  onTogglePlay,
}: EpisodeDetailProps) {
  const canPlay = episode.status === 'ready' && episode.audioUrl;
  const actionLabel = isGenerating ? 'Generating' : canPlay ? (isPlaying ? 'Pause' : 'Play') : 'Generate';

  return (
    <main className="page-shell">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Episodes
      </button>

      <section className="episode-hero" aria-label="Episode detail">
        <PodcastCover title={podcast.title} compact />
        <div className="episode-detail-copy">
          <div className="episode-meta">
            <span>Lecture {episode.lectureNumber}</span>
            <span>
              <Clock size={16} />
              {durationLabel}
            </span>
          </div>
          <h1>{episode.title}</h1>
          <p>{podcast.title}</p>
          <button className="primary-button" type="button" onClick={onTogglePlay} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="spin" size={18} />
            ) : isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
            {actionLabel}
          </button>
          {generationError ? (
            <p className="generation-error">
              <AlertCircle size={16} />
              {generationError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="script-section" aria-label="Episode script">
        <div className="section-header">
          <h2>Script</h2>
          <span className="script-source">
            <FileText size={16} />
            {episode.documentName}
          </span>
        </div>
        <div className="script-body">
          {episode.script.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {episode.status !== 'ready' ? (
            <p>
              Background reading: {episode.documentName}. Generate this episode to create
              audio and a full script from the source chunks.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
