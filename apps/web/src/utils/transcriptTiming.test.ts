import { describe, expect, it } from 'vitest';
import { activeTranscriptIndex, resolveTranscriptTimeline } from './transcriptTiming';

describe('transcript timing', () => {
  it('preserves complete generated timings', () => {
    const timeline = resolveTranscriptTimeline([
      { speaker: 'Host A', text: 'Welcome.', startSeconds: 0, endSeconds: 3 },
      { speaker: 'Host B', text: 'A longer explanation follows.', startSeconds: 3, endSeconds: 9 },
    ], 20);

    expect(timeline.map((turn) => turn.timingSource)).toEqual(['generated', 'generated']);
    expect(timeline.at(-1)?.endSeconds).toBe(9);
  });

  it('estimates old transcripts by word weight within the audio duration', () => {
    const timeline = resolveTranscriptTimeline([
      { speaker: 'Host A', text: 'One word' },
      { speaker: 'Host B', text: 'One two three four' },
    ], 12);

    expect(timeline).toEqual([
      expect.objectContaining({ startSeconds: 0, endSeconds: 4, timingSource: 'estimated' }),
      expect.objectContaining({ startSeconds: 4, endSeconds: 12, timingSource: 'estimated' }),
    ]);
  });

  it('keeps the previous line active through a generated inter-chunk gap', () => {
    const timeline = resolveTranscriptTimeline([
      { text: 'First', startSeconds: 0, endSeconds: 4 },
      { text: 'Second', startSeconds: 4.5, endSeconds: 8 },
    ], 8);

    expect(activeTranscriptIndex(timeline, 4.25)).toBe(0);
    expect(activeTranscriptIndex(timeline, 4.5)).toBe(1);
    expect(activeTranscriptIndex(timeline, 99)).toBe(1);
  });
});
