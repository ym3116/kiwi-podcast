import { describe, expect, it } from 'vitest';
import { normalizePodcastPayload } from './podcast-normalizer';

describe('normalizePodcastPayload', () => {
  it('creates one placeholder episode per lecture document', () => {
    const result = normalizePodcastPayload('class-1', {
      className: 'Intro to Computing',
      description: 'Course lecture audio',
      materials: {
        documents: [
          { id: 'doc-a', fileName: 'loops.pdf', materialType: 'lecture' },
          { id: 'doc-recitation', fileName: 'loops-recitation.pdf', materialType: 'recitation' },
          { id: 'doc-b', fileName: 'arrays.slides.pdf', materialType: 'class materials' },
          { id: 'doc-c', fileName: 'functions.pdf', materialType: 'Lecture' },
        ],
      },
    });

    expect(result.podcast.title).toBe('Intro to Computing - Podcast');
    expect(result.episodes).toHaveLength(3);
    expect(result.episodes[0]).toMatchObject({
      documentId: 'doc-a',
      title: 'Lecture 1 - loops',
      lectureNumber: 1,
      status: 'placeholder',
    });
    expect(result.episodes[1].title).toBe('Lecture 2 - arrays.slides');
    expect(result.episodes[2].title).toBe('Lecture 3 - functions');
  });

  it('supports the class documents fallback payload shape', () => {
    const result = normalizePodcastPayload('class-1', {
      documents: [{ id: 'doc-a', fileName: 'syllabus.pdf', materialType: 'lecture' }],
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
