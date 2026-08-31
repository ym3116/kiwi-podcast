import { LocateFixed, MessageCircle } from 'lucide-react';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TranscriptTurn } from '../types/podcastView';
import {
  activeTranscriptIndex,
  resolveTranscriptTimeline,
  TimedTranscriptTurn,
} from '../utils/transcriptTiming';
import { formatDuration } from '../utils/audioTime';

export interface TranscriptLineSelection {
  index: number;
  line: TimedTranscriptTurn;
  previous?: TimedTranscriptTurn;
  next?: TimedTranscriptTurn;
}

interface TranscriptReaderProps {
  itemKey: string;
  turns: TranscriptTurn[];
  currentTime: number;
  duration: number;
  isCurrentTrack: boolean;
  mode: 'live' | 'simulator';
  onPause: () => void;
  onSeek: (time: number) => void;
  onAsk: (selection: TranscriptLineSelection) => void;
}

const manualScrollKeys = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

export function TranscriptReader({
  itemKey,
  turns,
  currentTime,
  duration,
  isCurrentTrack,
  mode,
  onPause,
  onSeek,
  onAsk,
}: TranscriptReaderProps) {
  const timeline = useMemo(
    () => resolveTranscriptTimeline(turns, duration),
    [duration, turns],
  );
  const activeIndex = isCurrentTrack ? activeTranscriptIndex(timeline, currentTime) : -1;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const programmaticScrollRef = useRef(false);
  const scrollTimerRef = useRef<number | null>(null);

  const scrollToLine = useCallback((index: number, smooth = true) => {
    const viewport = viewportRef.current;
    const line = lineRefs.current[index];
    if (!viewport || !line) return;
    programmaticScrollRef.current = true;
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    const top = Math.max(0, line.offsetTop - viewport.clientHeight / 2 + line.clientHeight / 2);
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    } else {
      line.scrollIntoView?.({ block: 'center', behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    }
    scrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      scrollTimerRef.current = null;
    }, smooth && !reduceMotion ? 450 : 0);
  }, []);

  useEffect(() => {
    setSelectedIndex(null);
    setFollowPlayback(true);
    setNotice(null);
  }, [itemKey]);

  useEffect(() => {
    if (followPlayback && activeIndex >= 0) scrollToLine(activeIndex);
  }, [activeIndex, followPlayback, scrollToLine]);

  useEffect(() => () => {
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
  }, []);

  const stopFollowing = () => {
    if (!programmaticScrollRef.current) setFollowPlayback(false);
  };

  const manuallyStopFollowing = () => setFollowPlayback(false);

  const handleViewportKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (manualScrollKeys.has(event.key)) manuallyStopFollowing();
  };

  const selectLine = (index: number) => {
    setSelectedIndex(index);
    setFollowPlayback(false);
    setNotice(null);
  };

  const askAboutLine = (index: number) => {
    const line = timeline[index];
    if (!line) return;
    onPause();
    setSelectedIndex(index);
    setFollowPlayback(false);
    onAsk({
      index,
      line,
      previous: timeline[index - 1],
      next: timeline[index + 1],
    });
    const speaker = line.speaker || 'this line';
    const timestamp = formatDuration(line.startSeconds);
    setNotice(mode === 'simulator'
      ? `Kiwi Chat is unavailable in Simulator mode. Context is prepared for ${speaker} at ${timestamp}.`
      : `Kiwi Chat has context for ${speaker} at ${timestamp}. Ask your question in the chat panel.`);
  };

  const locateCurrentLine = () => {
    if (activeIndex < 0) return;
    setFollowPlayback(true);
    scrollToLine(activeIndex);
  };

  return (
    <div className="transcript-reader">
      <div className="transcript-controls">
        <span className={followPlayback ? 'follow-status active' : 'follow-status'}>
          {followPlayback ? 'Following playback' : 'Follow paused'}
        </span>
        <div>
          {!followPlayback && activeIndex >= 0 ? (
            <button className="transcript-control-button" type="button" onClick={locateCurrentLine}>
              <LocateFixed size={16} /> Locate current line
            </button>
          ) : null}
          {activeIndex >= 0 ? (
            <button className="transcript-control-button ask-current-button" type="button" onClick={() => askAboutLine(activeIndex)}>
              <MessageCircle size={16} /> Ask about current line
            </button>
          ) : null}
        </div>
      </div>

      {notice ? <p className="kiwi-context-notice" role="status">{notice}</p> : null}

      <div
        ref={viewportRef}
        className={`transcript${timeline.length <= 4 ? ' compact' : ''}`}
        role="region"
        aria-label="Synchronized podcast transcript"
        tabIndex={0}
        onKeyDown={handleViewportKeyDown}
        onScroll={stopFollowing}
        onTouchStart={manuallyStopFollowing}
        onWheel={manuallyStopFollowing}
      >
        {timeline.map((turn, index) => {
          const isActive = index === activeIndex;
          const isSelected = index === selectedIndex;
          const speaker = turn.speaker || 'Narrator';
          return (
            <article
              ref={(element) => { lineRefs.current[index] = element; }}
              className={`transcript-line${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
              key={`${turn.speaker ?? 'paragraph'}-${index}`}
              aria-current={isActive ? 'true' : undefined}
              data-active={isActive ? 'true' : 'false'}
              data-selected={isSelected ? 'true' : 'false'}
              tabIndex={0}
              onClick={() => selectLine(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectLine(index);
                }
              }}
            >
              <button
                className="transcript-timestamp"
                type="button"
                disabled={!isCurrentTrack}
                aria-label={`Seek to ${formatDuration(turn.startSeconds)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(turn.startSeconds);
                }}
              >
                {formatDuration(turn.startSeconds)}
              </button>
              <div className="transcript-line-copy">
                <span>{speaker}</span>
                <p>{turn.text}</p>
              </div>
              <button
                className="ask-kiwi-line-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  askAboutLine(index);
                }}
                aria-label={`Ask Kiwi about ${speaker} at ${formatDuration(turn.startSeconds)}`}
              >
                <MessageCircle size={16} /> Ask Kiwi
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
