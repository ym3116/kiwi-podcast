import { FileText, Play, RotateCw, Sparkles } from 'lucide-react';
import { PodcastEpisode, PodcastResponse } from '../types/podcast';
import { classEpisodeView, podcastViewKey } from '../types/podcastView';
import { LibraryHero, PodcastListRow } from './PodcastLibrary';

interface PodcastOverviewProps {
  data: PodcastResponse;
  playingKey: string | null;
  onSelectEpisode: (episode: PodcastEpisode) => void;
  onPlayAll: () => void;
  onPlayEpisode: (episode: PodcastEpisode) => void | Promise<void>;
  onRefresh: () => void;
  generatingId: string | null;
  onCreate: () => void;
}

export function PodcastOverview({
  data,
  playingKey,
  onSelectEpisode,
  onPlayAll,
  onPlayEpisode,
  onRefresh,
  generatingId,
  onCreate,
}: PodcastOverviewProps) {
  return (
    <div className="podcast-library">
      <LibraryHero
        accent="class"
        eyebrow="Kiwi class podcast"
        title={data.podcast.title}
        description={data.podcast.description}
        countLabel={`${data.episodes.length} episode${data.episodes.length === 1 ? '' : 's'}`}
        sourceLabel="Class materials"
      >
        <button className="primary-button create-button" type="button" onClick={onCreate}>
          <Sparkles size={18} /> Create your podcast
        </button>
        <button className="primary-button" type="button" onClick={onPlayAll} disabled={data.episodes.length === 0}>
          <Play size={18} fill="currentColor" /> Play All
        </button>
        <button className="icon-button label-button" type="button" onClick={onRefresh}>
          <RotateCw size={17} /> Refresh
        </button>
      </LibraryHero>

      <section className="library-list-section" aria-labelledby="class-episodes-heading">
        <div className="section-header">
          <div>
            <div className="eyebrow">Browse and listen</div>
            <h2 id="class-episodes-heading">Episodes</h2>
          </div>
        </div>
        {data.episodes.length === 0 ? (
          <div className="empty-state compact-empty">
            <FileText size={28} />
            <p>No lecture documents are available for podcast episodes yet.</p>
          </div>
        ) : (
          <div className="podcast-list">
            {data.episodes.map((episode) => {
              const item = classEpisodeView(data.podcast, episode);
              return (
                <PodcastListRow
                  key={episode.id}
                  item={item}
                  isBusy={generatingId === episode.id}
                  isPlaying={playingKey === podcastViewKey(item)}
                  onOpen={() => onSelectEpisode(episode)}
                  onPlay={() => void onPlayEpisode(episode)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
