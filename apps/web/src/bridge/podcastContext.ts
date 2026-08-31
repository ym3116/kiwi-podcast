import { PodcastViewItem } from '../types/podcastView';
import { formatDuration } from '../utils/audioTime';
import { TimedTranscriptTurn } from '../utils/transcriptTiming';

interface TranscriptContextSelection {
  line: TimedTranscriptTurn;
  previous?: TimedTranscriptTurn;
  next?: TimedTranscriptTurn;
}

interface TranscriptContextInput {
  className?: string;
  item: PodcastViewItem;
  selection: TranscriptContextSelection;
}

function renderLine(label: string, line?: TimedTranscriptTurn): string {
  if (!line) return `${label}: Not available`;
  return `${label} (${line.speaker || 'Narrator'}): ${line.text}`;
}

export function buildTranscriptKiwiContext({
  className,
  item,
  selection,
}: TranscriptContextInput): string {
  return [
    'KIWI APP CONTEXT',
    'App: Kiwi Podcast',
    'Current state: The student paused to ask about a podcast transcript line.',
    `Class: ${className?.trim() || 'Current Kiwi class'}`,
    `Episode: ${item.title}`,
    `Episode type: ${item.source === 'class' ? 'Published class podcast' : 'Personal podcast'}`,
    `Playback position: ${formatDuration(selection.line.startSeconds)}`,
    `Source materials: ${item.materials.join(', ') || 'No source names available'}`,
    '',
    renderLine('Previous line', selection.previous),
    renderLine('SELECTED LINE', selection.line),
    renderLine('Next line', selection.next),
    '',
    'Interpret “this”, “this line”, and “this moment” as the selected line above, using adjacent lines only for local context.',
    'Ground the answer in the supplied podcast transcript and named class sources. If the context is insufficient, say so instead of guessing.',
    'Kiwi Podcast automatically generates its script and audio from class materials. Do not tell the student to record, edit, upload, or add effects to audio.',
    'The Kiwi assistant can explain the selected learning content but cannot operate the Podcast app or press its controls.',
  ].join('\n');
}
