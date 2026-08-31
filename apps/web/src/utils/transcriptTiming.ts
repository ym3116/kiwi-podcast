import { TranscriptTurn } from '../types/podcastView';

export type TranscriptTimingSource = 'generated' | 'estimated';

export interface TimedTranscriptTurn extends TranscriptTurn {
  startSeconds: number;
  endSeconds: number;
  timingSource: TranscriptTimingSource;
}

function isFiniteTiming(turn: TranscriptTurn): boolean {
  return Number.isFinite(turn.startSeconds)
    && Number.isFinite(turn.endSeconds)
    && (turn.startSeconds ?? -1) >= 0
    && (turn.endSeconds ?? -1) > (turn.startSeconds ?? 0);
}

function wordWeight(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

export function resolveTranscriptTimeline(
  turns: TranscriptTurn[],
  durationSeconds: number,
): TimedTranscriptTurn[] {
  if (turns.length === 0) return [];

  const generated = turns.every(isFiniteTiming)
    && turns.every((turn, index) => index === 0
      || (turn.startSeconds ?? 0) >= (turns[index - 1].startSeconds ?? 0));
  if (generated) {
    return turns.map((turn) => ({
      ...turn,
      startSeconds: turn.startSeconds!,
      endSeconds: turn.endSeconds!,
      timingSource: 'generated',
    }));
  }

  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : turns.length;
  const totalWeight = turns.reduce((sum, turn) => sum + wordWeight(turn.text), 0);
  let startSeconds = 0;

  return turns.map((turn, index) => {
    const endSeconds = index === turns.length - 1
      ? safeDuration
      : startSeconds + safeDuration * (wordWeight(turn.text) / totalWeight);
    const timedTurn: TimedTranscriptTurn = {
      ...turn,
      startSeconds,
      endSeconds,
      timingSource: 'estimated',
    };
    startSeconds = endSeconds;
    return timedTurn;
  });
}

export function activeTranscriptIndex(
  turns: TimedTranscriptTurn[],
  currentTime: number,
): number {
  if (turns.length === 0) return -1;
  const safeTime = Math.max(0, currentTime);
  const containing = turns.findIndex(
    (turn) => safeTime >= turn.startSeconds && safeTime < turn.endSeconds,
  );
  if (containing >= 0) return containing;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (safeTime >= turns[index].startSeconds) return index;
  }
  return 0;
}
