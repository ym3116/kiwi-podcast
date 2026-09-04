import { describe, expect, it } from 'vitest';
import {
  buildPodcastAdminKiwiContext,
  buildPodcastKiwiContext,
  buildTranscriptKiwiContext,
} from './podcastContext';

describe('Kiwi Podcast capability context', () => {
  it('limits student navigation to Class Podcast and My Podcasts', () => {
    const context = buildPodcastKiwiContext({
      className: 'Machine Learning',
      userRole: 'student',
      currentState: 'Current screen: Class Podcast tab.',
    });

    expect(context).toContain('Current Kiwi role: student');
    expect(context).toContain('Only Class Podcast and My Podcasts are available');
    expect(context).toContain('Manage is not available');
    expect(context).toContain('Students do not see or have access to Manage');
    expect(context).toContain('Current screen: Class Podcast tab.');
  });

  it('describes the protected Manage workflow only when access was verified', () => {
    const context = buildPodcastKiwiContext({
      className: 'Machine Learning',
      userRole: 'professor',
      canManage: true,
      currentState: 'Current screen: Manage tab.',
    });

    expect(context).toContain('Class Podcast, My Podcasts, and Manage are available');
    expect(context).toContain('generate or edit the script');
    expect(context).toContain('per-podcast host and speaker voice overrides');
    expect(context).toContain('explicitly publish');
  });

  it('describes both pages of the system admin surface', () => {
    const defaults = buildPodcastAdminKiwiContext({ activePage: 'defaults' });
    const classes = buildPodcastAdminKiwiContext({
      activePage: 'classes',
      visibleClassCount: 4,
    });

    expect(defaults).toContain('Current surface: Podcast Admin > Global Defaults');
    expect(defaults).toContain('system-wide Podcast Admin panel is also available');
    expect(classes).toContain('Current surface: Podcast Admin > All Classes');
    expect(classes).toContain('Visible classes: 4');
    expect(classes).toContain('not a full podcast-content browser');
  });
});

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
    expect(context).toContain('FEATURES AND NAVIGATION');
    expect(context).toContain('Do not tell the student to record, edit, upload, or add effects');
  });
});
