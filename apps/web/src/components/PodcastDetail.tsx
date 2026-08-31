import { AlertCircle, ArrowLeft, Clock3, FileText, Headphones, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { PodcastViewItem } from '../types/podcastView';
import { TranscriptLineSelection, TranscriptReader } from './TranscriptReader';

interface PodcastDetailProps {
  item: PodcastViewItem;
  isPlaying: boolean;
  isBusy: boolean;
  currentTime: number;
  duration: number;
  isCurrentTrack: boolean;
  mode: 'live' | 'simulator';
  error: string | null;
  onBack: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onAskLine: (selection: TranscriptLineSelection) => void;
  onTogglePlay: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
}

export function PodcastDetail({
  item,
  isPlaying,
  isBusy,
  currentTime,
  duration,
  isCurrentTrack,
  mode,
  error,
  onBack,
  onPause,
  onSeek,
  onAskLine,
  onTogglePlay,
  onRetry,
}: PodcastDetailProps) {
  const isReady = item.status === 'ready' && Boolean(item.audioUrl);
  const isFailed = item.status === 'failed';
  const isProcessing = item.source === 'personal' && !isReady && !isFailed;
  const actionLabel = isBusy
    ? 'Generating'
    : isReady
      ? isPlaying ? 'Pause' : 'Play'
      : item.source === 'class'
        ? 'Not published'
        : item.statusMessage || 'Generating';

  return (
    <main className="page-shell detail-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to {item.source === 'class' ? 'Class Podcast' : 'My Podcasts'}
      </button>

      <section className={`detail-hero ${item.source}`} aria-labelledby="podcast-detail-title">
        <div className="detail-art" aria-hidden="true">
          <Headphones size={42} />
          <strong>{item.artLabel}</strong>
        </div>
        <div className="detail-copy">
          <div className="episode-meta">
            <span>{item.eyebrow}</span>
            <span><Clock3 size={16} /> {item.durationLabel}</span>
            <span className={`podcast-status ${item.status}`}>{item.statusLabel}</span>
          </div>
          <h1 id="podcast-detail-title">{item.title}</h1>
          <p>{item.summary}</p>
          <div className="detail-actions">
            {item.source !== 'class' || isReady ? (
              <button
                className="primary-button"
                type="button"
                onClick={onTogglePlay}
                disabled={isBusy || isProcessing}
              >
                {isBusy || isProcessing ? <Loader2 className="spin" size={18} /> : isFailed ? (
                  <RotateCcw size={17} />
                ) : isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                {actionLabel}
              </button>
            ) : onRetry ? (
              <button className="primary-button" type="button" onClick={onRetry}>
                <RotateCcw size={17} /> Try again
              </button>
            ) : null}
          </div>
          {isProcessing ? (
            <div className="detail-progress" aria-label={`${item.progressPercent ?? 0}% complete`}>
              <div className="card-progress"><span style={{ width: `${item.progressPercent ?? 0}%` }} /></div>
              <span>{item.statusMessage} · {item.progressPercent ?? 0}%</span>
            </div>
          ) : null}
          {error || item.errorMessage ? (
            <p className="generation-error"><AlertCircle size={16} />{error || item.errorMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="detail-sources" aria-label="Podcast sources">
        <div className="section-header">
          <div>
            <div className="eyebrow">Grounded in your class</div>
            <h2>Sources</h2>
          </div>
          <span className="script-source"><FileText size={16} /> {item.materials.length} selected</span>
        </div>
        <div className="source-chips">
          {item.materials.map((material) => <span key={material}>{material}</span>)}
        </div>
      </section>

      <section className="script-section" aria-label="Podcast script">
        <div className="section-header">
          <div>
            <div className="eyebrow">Read along</div>
            <h2>Script</h2>
          </div>
          <span className="script-source"><FileText size={16} /> {item.sourceLabel}</span>
        </div>
        {item.transcript.length > 0 ? (
          <TranscriptReader
            itemKey={`${item.source}:${item.id}`}
            turns={item.transcript}
            currentTime={currentTime}
            duration={duration}
            isCurrentTrack={isCurrentTrack}
            mode={mode}
            onPause={onPause}
            onSeek={onSeek}
            onAsk={onAskLine}
          />
        ) : (
          <div className="script-empty">
            <FileText size={26} />
            <h3>{isFailed ? 'The script could not be completed' : 'Your script is being prepared'}</h3>
            <p>{isFailed ? 'Retry this podcast to generate a new script and audio.' : 'It will appear here automatically as soon as it is ready.'}</p>
          </div>
        )}
      </section>
    </main>
  );
}
