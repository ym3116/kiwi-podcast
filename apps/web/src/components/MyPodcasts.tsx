import { Clock3, Headphones, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PersonalPodcast } from '../types/podcast';

interface MyPodcastsProps {
  podcasts: PersonalPodcast[];
  loading: boolean;
  onCreate: () => void;
  onRetry: (podcast: PersonalPodcast) => void | Promise<void>;
  onDelete: (podcast: PersonalPodcast) => void | Promise<void>;
}

export function MyPodcasts({
  podcasts,
  loading,
  onCreate,
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
    <section className="my-podcasts-section">
      <div className="section-header">
        <div>
          <div className="eyebrow">Made for you</div>
          <h2>My Podcasts</h2>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>
          <Plus size={18} /> Create podcast
        </button>
      </div>

      {deleteError ? <p className="library-error">{deleteError}</p> : null}

      {loading ? (
        <div className="center-state"><Loader2 className="spin" /><p>Loading your podcasts</p></div>
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
        <div className="personal-grid">
          {podcasts.map((podcast) => {
            const isDeleting = deletingId === podcast.id;
            const canDelete = podcast.status === 'ready' || podcast.status === 'failed';
            return (
              <article className="personal-card" key={podcast.id}>
                <div className="personal-art"><Headphones /></div>
                <div className="personal-card-body">
                  <div className="personal-card-header">
                    <span className={`podcast-status ${podcast.status}`}>
                      {podcast.status.replace(/_/g, ' ')}
                    </span>
                    {canDelete ? (
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
                  </div>
                  <h3>{podcast.title}</h3>
                  <p>{podcast.summary || podcast.prompt}</p>
                  <div className="personal-meta">
                    <span><Clock3 size={14} /> {podcast.durationMinutes} min</span>
                    <span>{podcast.difficulty}</span>
                    <span>{podcast.selectedMaterials.length} material{podcast.selectedMaterials.length === 1 ? '' : 's'}</span>
                  </div>
                  {podcast.status !== 'ready' && podcast.status !== 'failed' ? (
                    <><div className="card-progress"><span style={{ width: `${podcast.progressPercent}%` }} /></div><small>{podcast.statusMessage} · {podcast.progressPercent}%</small></>
                  ) : null}
                  {podcast.status === 'ready' && podcast.audioUrl ? <audio controls preload="metadata" src={podcast.audioUrl} /> : null}
                  {podcast.status === 'failed' ? (
                    <><p className="generation-error">{podcast.errorMessage}</p><button className="secondary-button" type="button" onClick={() => onRetry(podcast)}><RotateCcw size={15} /> Try again</button></>
                  ) : null}
                  {confirmingId === podcast.id ? (
                    <div className="delete-confirmation" role="alert">
                      <p>Delete this podcast and its audio permanently?</p>
                      <div>
                        <button
                          className="text-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="confirm-delete-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void remove(podcast)}
                        >
                          {isDeleting ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                          {isDeleting ? 'Deleting…' : 'Delete permanently'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
