import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { PodcastEpisode } from '../types/podcast';

interface PlayerBarProps {
  episode: PodcastEpisode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
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
  episode,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onTogglePlay,
  onSeek,
  onSkip,
  onCycleSpeed,
}: PlayerBarProps) {
  const progress = duration > 0 ? currentTime / duration : 0;
  const stopControlEvent = (
    event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
  };

  return (
    <section className="player-bar" aria-label="Now playing" onClick={stopControlEvent}>
      <button
        className="speed-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCycleSpeed();
        }}
      >
        {playbackRate}x
      </button>

      <div className="transport-controls">
        <button
          className="transport-button skip-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSkip(-15);
          }}
          aria-label="Back 15 seconds"
        >
          <RotateCcw size={20} />
          <span>15</span>
        </button>
        <button
          className="transport-button play-button-small"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onTogglePlay();
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button
          className="transport-button skip-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSkip(15);
          }}
          aria-label="Forward 15 seconds"
        >
          <RotateCw size={20} />
          <span>15</span>
        </button>
      </div>

      <div className="now-playing">
        <div className="mini-art">{episode.lectureNumber}</div>
        <div className="now-playing-main">
          <div className="now-playing-text">
            <strong>{episode.title}</strong>
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
            onChange={(event) => {
              event.stopPropagation();
              onSeek(Number(event.target.value));
            }}
            style={{ '--progress': `${Math.round(progress * 100)}%` } as CSSProperties}
            type="range"
            value={Math.min(currentTime, duration || 1)}
          />
        </div>
      </div>
    </section>
  );
}
