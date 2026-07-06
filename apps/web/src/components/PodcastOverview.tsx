import { Clock, FileText, ListMusic, Play, RotateCw } from 'lucide-react';
import { PodcastEpisode, PodcastResponse } from '../types/podcast';
import { PodcastCover } from './PodcastCover';

interface PodcastOverviewProps {
  data: PodcastResponse;
  activeEpisodeId: string | null;
  playingId: string | null;
  onSelectEpisode: (episode: PodcastEpisode) => void;
  onPlayAll: () => void;
  onPlayEpisode: (episode: PodcastEpisode) => void;
  onRefresh: () => void;
}

export function PodcastOverview({
  data,
  activeEpisodeId,
  playingId,
  onSelectEpisode,
  onPlayAll,
  onPlayEpisode,
  onRefresh,
}: PodcastOverviewProps) {
  return (
    <main className="page-shell">
      <section className="podcast-hero" aria-label="Podcast">
        <PodcastCover title={data.podcast.title} />
        <div className="podcast-copy">
          <div className="eyebrow">Kiwi class podcast</div>
          <h1>{data.podcast.title}</h1>
          <p>{data.podcast.description}</p>
          <div className="hero-meta">
            <span>
              <ListMusic size={16} />
              {data.episodes.length} episodes
            </span>
            <span>
              <FileText size={16} />
              Source documents
            </span>
          </div>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onPlayAll}>
              <Play size={18} fill="currentColor" />
              Play All
            </button>
            <button className="icon-button label-button" type="button" onClick={onRefresh}>
              <RotateCw size={17} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="episodes-section" aria-label="Episodes">
        <div className="section-header">
          <h2>Episodes</h2>
        </div>

        {data.episodes.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <p>No lecture documents are available for podcast episodes yet.</p>
          </div>
        ) : (
          <div className="episode-list">
            {data.episodes.map((episode) => (
              <article
                className={episode.id === activeEpisodeId ? 'episode-row active' : 'episode-row'}
                key={episode.id}
              >
                <button
                  className="episode-main"
                  type="button"
                  onClick={() => onSelectEpisode(episode)}
                >
                  <div className="episode-thumb">
                    <span>{episode.lectureNumber}</span>
                  </div>
                  <div className="episode-text">
                    <div className="episode-kicker">Lecture {episode.lectureNumber}</div>
                    <h3>{episode.title}</h3>
                    <p>{episode.script}</p>
                  </div>
                </button>
                <div className="episode-side">
                  <span className="duration">
                    <Clock size={15} />
                    {episode.durationLabel}
                  </span>
                  <button
                    className="round-play"
                    type="button"
                    aria-label={`Play ${episode.title}`}
                    onClick={() => onPlayEpisode(episode)}
                  >
                    <Play
                      size={16}
                      fill={playingId === episode.id ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
