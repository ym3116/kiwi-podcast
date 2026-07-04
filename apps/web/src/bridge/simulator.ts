import { PodcastResponse } from '../types/podcast';
import { KiwiAppToken, KiwiContext } from './types';

export const simulatorContext: KiwiContext = {
  classId: 'sim-class-intro-cs',
  className: 'Introduction to Computer Programming',
  userId: 'sim-user-1',
  username: 'Student Demo',
  userRole: 'student',
  appId: 'sim-app-kiwi-podcast',
  appSlug: 'kiwi-podcast',
  uiSlug: 'student',
  capabilities: ['ai', 'mcp'],
};

export const simulatorToken: KiwiAppToken = {
  accessToken: 'simulated-kiwi-app-token',
  scopes: ['user:profile:read', 'class:info:read', 'class:enrollments:read'],
  expiresIn: 3600,
  appSlug: 'kiwi-podcast',
};

export const simulatorPodcast: PodcastResponse = {
  podcast: {
    id: 'podcast-sim-class-intro-cs',
    classId: simulatorContext.classId,
    title: `${simulatorContext.className} - Podcast`,
    description:
      'Generated lecture episodes for this Kiwi class. Audio and scripts are placeholders in this version.',
    coverTheme: 'kiwi-gradient',
  },
  episodes: [
    {
      id: 'episode-sim-1',
      documentId: 'doc-sim-1',
      title: 'Lecture 1 - Python basics',
      lectureNumber: 1,
      documentName: 'Python basics',
      materialType: 'lecture',
      durationLabel: '11 min',
      status: 'placeholder',
      script:
        'Welcome to Lecture 1. Today we introduce the mental model for Python programs: values, names, expressions, and the way the interpreter evaluates each line. In the finished version, this script will be generated from Kiwi document embeddings.',
    },
    {
      id: 'episode-sim-2',
      documentId: 'doc-sim-2',
      title: 'Lecture 2 - Conditionals and loops',
      lectureNumber: 2,
      documentName: 'Conditionals and loops',
      materialType: 'slides',
      durationLabel: '14 min',
      status: 'placeholder',
      script:
        'This placeholder episode walks through decisions, repeated work, and tracing loops by hand. The generated podcast will later connect these ideas to examples from the source document.',
    },
    {
      id: 'episode-sim-3',
      documentId: 'doc-sim-3',
      title: 'Lecture 3 - Lists and dictionaries',
      lectureNumber: 3,
      documentName: 'Lists and dictionaries',
      materialType: 'worksheet',
      durationLabel: '17 min',
      status: 'placeholder',
      script:
        'This episode preview focuses on choosing the right data structure and reading code that mutates collections. Future generation will cite and summarize the actual lecture material.',
    },
  ],
};
