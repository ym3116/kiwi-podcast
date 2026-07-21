import { Clock3, Headphones, Loader2, Pause, Play } from 'lucide-react';
import { ReactNode } from 'react';
import { PodcastViewItem } from '../types/podcastView';

interface LibraryHeroProps {
  accent: PodcastViewItem['source'];
  eyebrow: string;
  title: string;
  description: string;
  countLabel: string;
  sourceLabel: string;
  children: ReactNode;
}

export function LibraryHero({
  accent,
  eyebrow,
  title,
  description,
  countLabel,
  sourceLabel,
  children,
}: LibraryHeroProps) {
  return (
    <section className={`library-hero ${accent}`} aria-labelledby={`${accent}-library-title`}>
      <div className="library-art" aria-hidden="true">
        <Headphones size={38} />
        <span>{accent === 'class' ? 'CLASS' : 'FOR YOU'}</span>
      </div>
      <div className="library-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1 id={`${accent}-library-title`}>{title}</h1>
        <p>{description}</p>
        <div className="library-meta">
          <span><Headphones size={16} /> {countLabel}</span>
          <span>{sourceLabel}</span>
        </div>
        <div className="hero-actions">{children}</div>
      </div>
    </section>
  );
}

interface PodcastListRowProps {
  item: PodcastViewItem;
  isPlaying: boolean;
  isBusy?: boolean;
  canPlay?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  trailingAction?: ReactNode;
  children?: ReactNode;
}

export function PodcastListRow({
  item,
  isPlaying,
  isBusy = false,
  canPlay = true,
  onOpen,
  onPlay,
  trailingAction,
  children,
}: PodcastListRowProps) {
  const progressVisible =
    item.source === 'personal' && !['ready', 'failed'].includes(item.status);

  return (
    <article className={`podcast-list-row ${item.source}`}>
      <button className="podcast-row-main" type="button" onClick={onOpen}>
        <div className="podcast-row-art" aria-hidden="true">{item.artLabel}</div>
        <div className="podcast-row-copy">
          <div className="podcast-row-heading">
            <span className="episode-kicker">{item.eyebrow}</span>
            <span className={`podcast-status ${item.status}`}>{item.statusLabel}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <div className="podcast-row-meta">
            <span><Clock3 size={14} /> {item.durationLabel}</span>
            <span>{item.materials.length} source{item.materials.length === 1 ? '' : 's'}</span>
          </div>
          {progressVisible ? (
            <div className="row-progress-group" aria-label={`${item.progressPercent ?? 0}% complete`}>
              <div className="card-progress"><span style={{ width: `${item.progressPercent ?? 0}%` }} /></div>
              <small>{item.statusMessage} · {item.progressPercent ?? 0}%</small>
            </div>
          ) : null}
        </div>
      </button>
      <div className="podcast-row-actions">
        {trailingAction}
        <button
          className="round-play"
          type="button"
          aria-label={`${isPlaying ? 'Pause' : canPlay ? 'Play' : item.status === 'failed' ? 'Unavailable' : 'Generating'} ${item.title}`}
          disabled={isBusy || !canPlay}
          onClick={onPlay}
        >
          {isBusy ? <Loader2 className="spin" size={17} /> : isPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
      </div>
      {children}
    </article>
  );
}
