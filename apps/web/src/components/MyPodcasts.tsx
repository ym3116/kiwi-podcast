import { Headphones, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PersonalPodcast } from '../types/podcast';
import { personalPodcastView, podcastViewKey } from '../types/podcastView';
import { LibraryHero, PodcastListRow } from './PodcastLibrary';

interface MyPodcastsProps {
  podcasts: PersonalPodcast[];
  loading: boolean;
  playingKey: string | null;
  onCreate: () => void;
  onOpen: (podcast: PersonalPodcast) => void;
  onPlay: (podcast: PersonalPodcast) => void;
  onRetry: (podcast: PersonalPodcast) => void | Promise<void>;
  onDelete: (podcast: PersonalPodcast) => void | Promise<void>;
}

export function MyPodcasts({
  podcasts,
  loading,
  playingKey,
  onCreate,
  onOpen,
  onPlay,
  onRetry,
  onDelete,
}: MyPodcastsProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async (podcast: PersonalPodcast) => {
    setDeletingId(podcast.id);
    setDeleteError(null);
    try {
      await onDelete(podcast);
      setConfirmingId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete podcast.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="podcast-library">
      <LibraryHero
        accent="personal"
        eyebrow="Your personal studio"
        title="My Podcasts"
        description="Audio lessons shaped around your goals, level, and selected class materials."
        countLabel={`${podcasts.length} podcast${podcasts.length === 1 ? '' : 's'}`}
        sourceLabel="Made for you"
      >
        <button className="primary-button create-button" type="button" onClick={onCreate}>
          <Plus size={18} /> Create podcast
        </button>
      </LibraryHero>

      <section className="library-list-section" aria-labelledby="personal-podcasts-heading">
        <div className="section-header">
          <div>
            <div className="eyebrow">Your library</div>
            <h2 id="personal-podcasts-heading">All podcasts</h2>
          </div>
        </div>
        {deleteError ? <p className="library-error">{deleteError}</p> : null}
        {loading ? (
          <div className="center-state compact-state"><Loader2 className="spin" /><p>Loading your podcasts</p></div>
        ) : podcasts.length === 0 ? (
          <div className="personal-empty">
            <div><Headphones size={42} /></div>
            <h3>Your personal podcast studio</h3>
            <p>Choose class materials and turn a learning goal into an audio lesson made for you.</p>
            <button className="primary-button" type="button" onClick={onCreate}>
              <Sparkles size={18} /> Create your first podcast
            </button>
          </div>
        ) : (
          <div className="podcast-list">
            {podcasts.map((podcast) => {
              const item = personalPodcastView(podcast);
              const isDeleting = deletingId === podcast.id;
              const canDelete = podcast.status === 'ready' || podcast.status === 'failed';
              const canPlay = podcast.status === 'ready' && Boolean(podcast.audioUrl);
              return (
                <PodcastListRow
                  key={podcast.id}
                  item={item}
                  canPlay={canPlay}
                  isBusy={false}
                  isPlaying={playingKey === podcastViewKey(item)}
                  onOpen={() => onOpen(podcast)}
                  onPlay={() => onPlay(podcast)}
                  trailingAction={canDelete ? (
                    <button
                      className="delete-podcast-button"
                      type="button"
                      disabled={isDeleting}
                      aria-label={`Delete ${podcast.title}`}
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmingId(podcast.id);
                      }}
                    >
                      {isDeleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  ) : null}
                >
                  {podcast.status === 'failed' ? (
                    <div className="row-message error-message">
                      <span>{podcast.errorMessage || 'Generation stopped.'}</span>
                      <button className="secondary-button" type="button" onClick={() => onRetry(podcast)}>Try again</button>
                    </div>
                  ) : null}
                  {confirmingId === podcast.id ? (
                    <div className="delete-confirmation" role="alert">
                      <p>Delete this podcast and its audio permanently?</p>
                      <div>
                        <button className="text-button" type="button" disabled={isDeleting} onClick={() => setConfirmingId(null)}>Cancel</button>
                        <button className="confirm-delete-button" type="button" disabled={isDeleting} onClick={() => void remove(podcast)}>
                          {isDeleting ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                          {isDeleting ? 'Deleting…' : 'Delete permanently'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </PodcastListRow>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
