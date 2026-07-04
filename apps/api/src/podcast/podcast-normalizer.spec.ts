import { describe, expect, it } from 'vitest';
import { normalizePodcastPayload } from './podcast-normalizer';

describe('normalizePodcastPayload', () => {
  it('creates one placeholder episode per class material document', () => {
    const result = normalizePodcastPayload('class-1', {
      className: 'Intro to Computing',
      description: 'Course lecture audio',
      materials: {
        documents: [
          { id: 'doc-a', fileName: 'loops.pdf', materialType: 'lecture' },
          { id: 'doc-b', fileName: 'arrays.slides.pdf', materialType: 'slides' },
        ],
      },
    });

    expect(result.podcast.title).toBe('Intro to Computing - Podcast');
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toMatchObject({
      documentId: 'doc-a',
      title: 'Lecture 1 - loops',
      lectureNumber: 1,
      status: 'placeholder',
    });
    expect(result.episodes[1].title).toBe('Lecture 2 - arrays.slides');
  });

  it('supports the class documents fallback payload shape', () => {
    const result = normalizePodcastPayload('class-1', {
      documents: [{ id: 'doc-a', fileName: 'syllabus.pdf' }],
    });

    expect(result.podcast.title).toBe('Class - Podcast');
    expect(result.episodes[0].title).toBe('Lecture 1 - syllabus');
  });

  it('throws denied payload errors', () => {
    expect(() =>
      normalizePodcastPayload('class-1', { error: 'Access denied to class documents' }),
    ).toThrow('Access denied to class documents');
  });

  it('returns an empty episode list for classes with no documents', () => {
    const result = normalizePodcastPayload('class-1', {
      className: 'Empty Class',
      materials: { documents: [] },
    });

    expect(result.podcast.title).toBe('Empty Class - Podcast');
    expect(result.episodes).toEqual([]);
  });
});
