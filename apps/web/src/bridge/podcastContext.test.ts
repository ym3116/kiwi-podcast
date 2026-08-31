import { describe, expect, it } from 'vitest';
import { buildTranscriptKiwiContext } from './podcastContext';

describe('podcast transcript Kiwi context', () => {
  it('includes the selected moment, neighboring lines, sources, and capability limits', () => {
    const context = buildTranscriptKiwiContext({
      className: 'Machine Learning',
      item: {
        source: 'class', id: 'episode-1', title: 'Regularization', summary: 'Summary',
        eyebrow: 'Lecture 1', sourceLabel: 'ML Podcast', durationLabel: '10:00', artLabel: '1',
        status: 'ready', statusLabel: 'Published', transcript: [], materials: ['regularization.pdf'],
      },
      selection: {
        previous: { speaker: 'Host B', text: 'Compare ridge and Lasso.', startSeconds: 20, endSeconds: 30, timingSource: 'generated' },
        line: { speaker: 'Host A', text: 'L1 can set coefficients to zero.', startSeconds: 30, endSeconds: 40, timingSource: 'generated' },
        next: { speaker: 'Host B', text: 'That creates sparse models.', startSeconds: 40, endSeconds: 50, timingSource: 'generated' },
      },
    });

    expect(context).toContain('Class: Machine Learning');
    expect(context).toContain('Playback position: 0:30');
    expect(context).toContain('SELECTED LINE (Host A): L1 can set coefficients to zero.');
    expect(context).toContain('Source materials: regularization.pdf');
    expect(context).toContain('Do not tell the student to record, edit, upload, or add effects');
  });
});
