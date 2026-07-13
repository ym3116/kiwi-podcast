import { Clock, FileText, ListMusic, Loader2, Play, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { PodcastEpisode, PodcastResponse } from '../types/podcast';
import { formatDuration } from '../utils/audioTime';
import { PodcastCover } from './PodcastCover';

interface PodcastOverviewProps {
  data: PodcastResponse;
  activeEpisodeId: string | null;
  playingId: string | null;
  onSelectEpisode: (episode: PodcastEpisode) => void;
  onPlayAll: () => void;
  onPlayEpisode: (episode: PodcastEpisode) => void | Promise<void>;
  onRefresh: () => void;
  generatingId: string | null;
  onCreate: () => void;
}

export function PodcastOverview({
  data,
  activeEpisodeId,
  playingId,
  onSelectEpisode,
  onPlayAll,
  onPlayEpisode,
  onRefresh,
  generatingId,
  onCreate,
}: PodcastOverviewProps) {
  const [audioDurationLabels, setAudioDurationLabels] = useState<Record<string, string>>({});

  const rememberAudioDuration = (episodeId: string, duration: number) => {
    if (!Number.isFinite(duration)) return;
    setAudioDurationLabels((current) => {
      const label = formatDuration(duration);
      return current[episodeId] === label
        ? current
        : {
            ...current,
            [episodeId]: label,
          };
    });
  };

  return (
    <div>
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
            <button className="primary-button create-button" type="button" onClick={onCreate}>
              Create your podcast
            </button>
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
            {data.episodes.map((episode) => {
              const isGenerating = generatingId === episode.id;
              const durationLabel = audioDurationLabels[episode.id] ?? episode.durationLabel;
              return (
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
                      {durationLabel}
                    </span>
                    {episode.status === 'ready' && episode.audioUrl ? (
                      <audio
                        aria-hidden="true"
                        preload="metadata"
                        src={episode.audioUrl}
                        onDurationChange={(event) =>
                          rememberAudioDuration(episode.id, event.currentTarget.duration)
                        }
                        onLoadedMetadata={(event) =>
                          rememberAudioDuration(episode.id, event.currentTarget.duration)
                        }
                      />
                    ) : null}
                    <button
                      className="round-play"
                      type="button"
                      aria-label={`${episode.status === 'ready' ? 'Play' : 'Generate'} ${episode.title}`}
                      disabled={isGenerating}
                      onClick={() => onPlayEpisode(episode)}
                    >
                      {isGenerating ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Play
                          size={16}
                          fill={playingId === episode.id ? 'currentColor' : 'none'}
                        />
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
