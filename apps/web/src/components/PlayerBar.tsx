import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import type { ChangeEvent, CSSProperties, MouseEvent, PointerEvent } from 'react';
import { PodcastViewItem } from '../types/podcastView';

interface PlayerBarProps {
  item: PodcastViewItem;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onOpen: () => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (delta: number) => void;
  onCycleSpeed: () => void;
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function PlayerBar({
  item,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onOpen,
  onTogglePlay,
  onSeek,
  onSkip,
  onCycleSpeed,
}: PlayerBarProps) {
  const progress = duration > 0 ? currentTime / duration : 0;
  const stopControlEvent = (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => event.stopPropagation();
  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onSeek(Number(event.currentTarget.value));
  };

  return (
    <section className="player-bar" aria-label="Now playing">
      <button className="speed-button" type="button" onClick={onCycleSpeed} aria-label={`Playback speed ${playbackRate} times`}>
        {playbackRate}x
      </button>
      <div className="transport-controls">
        <button className="transport-button skip-button" type="button" onClick={() => onSkip(-15)} aria-label="Back 15 seconds">
          <RotateCcw size={20} /><span>15</span>
        </button>
        <button className="transport-button play-button-small" type="button" onClick={onTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button className="transport-button skip-button" type="button" onClick={() => onSkip(15)} aria-label="Forward 15 seconds">
          <RotateCw size={20} /><span>15</span>
        </button>
      </div>
      <div className="now-playing">
        <div className={`mini-art ${item.source}`}>{item.artLabel}</div>
        <div className="now-playing-main">
          <div className="now-playing-text">
            <button className="now-playing-title" type="button" onClick={onOpen}>
              <span>{item.source === 'class' ? 'Class Podcast' : 'My Podcast'}</span>
              <strong>{item.title}</strong>
            </button>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <input
            aria-label="Playback progress"
            className="progress-slider"
            max={duration || 1}
            min={0}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={stopControlEvent}
            onPointerDown={stopControlEvent}
            onChange={handleSeek}
            step="0.1"
            style={{ '--progress': `${Math.round(progress * 100)}%` } as CSSProperties}
            type="range"
            value={Math.min(currentTime, duration || 1)}
          />
        </div>
      </div>
    </section>
  );
}
