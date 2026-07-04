import { ArrowLeft, Clock, FileText, Pause, Play } from 'lucide-react';
import { PodcastEpisode, PodcastSummary } from '../types/podcast';
import { PodcastCover } from './PodcastCover';

interface EpisodeDetailProps {
  podcast: PodcastSummary;
  episode: PodcastEpisode;
  isPlaying: boolean;
  onBack: () => void;
  onTogglePlay: () => void;
}

export function EpisodeDetail({
  podcast,
  episode,
  isPlaying,
  onBack,
  onTogglePlay,
}: EpisodeDetailProps) {
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
              {episode.durationLabel}
            </span>
          </div>
          <h1>{episode.title}</h1>
          <p>{podcast.title}</p>
          <button className="primary-button" type="button" onClick={onTogglePlay}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
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
          <p>
            Background reading: {episode.documentName}. This episode is marked as{' '}
            {episode.status} until generated audio and full scripts are added.
          </p>
        </div>
      </section>
    </main>
  );
}
