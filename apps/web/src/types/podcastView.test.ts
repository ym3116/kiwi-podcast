import { describe, expect, it } from 'vitest';
import { classEpisodeView, parseClassTranscript } from './podcastView';

describe('class podcast view', () => {
  it('separates inline host turns and keeps the detail description concise', () => {
    const script = `HOST_A: ${'Lasso selects useful variables and encourages sparse models. '.repeat(8)} HOST_B: Ridge uses a different penalty. HOST_A: Let us compare them.`;
    const transcript = parseClassTranscript(script);
    const item = classEpisodeView(
      { id: 'podcast-1', classId: 'class-1', title: 'Class Podcast', description: 'Class audio', coverTheme: 'kiwi' },
      {
        id: 'episode-1',
        documentId: 'document-1',
        title: 'Lasso regression',
        lectureNumber: 1,
        documentName: 'Lasso notes',
        materialType: 'notes',
        durationLabel: '15 min',
        script,
        status: 'ready',
        audioUrl: '/audio.mp3',
      },
    );

    expect(transcript).toHaveLength(3);
    expect(transcript.map((turn) => turn.speaker)).toEqual(['Host A', 'Host B', 'Host A']);
    expect(item.summary.length).toBeLessThanOrEqual(181);
    expect(item.summary).not.toContain('HOST_');
  });
});
