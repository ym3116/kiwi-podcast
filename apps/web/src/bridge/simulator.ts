import { PodcastResponse } from '../types/podcast';
import { KiwiAppToken, KiwiContext } from './types';

export const simulatorContext: KiwiContext = {
  classId: '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
  className: 'Regularization',
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
    id: 'podcast-1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
    classId: simulatorContext.classId,
    title: `${simulatorContext.className} - Podcast`,
    description:
      'Generated lecture episodes for this Kiwi class. Audio and scripts are placeholders in this version.',
    coverTheme: 'kiwi-gradient',
  },
  episodes: [
    {
      id: 'episode-49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
      documentId: '49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
      title: 'Lecture 14 - Regularization 2',
      lectureNumber: 1,
      documentName: '14_regularization_2',
      materialType: 'class materials',
      durationLabel: '15 min',
      status: 'placeholder',
      script:
        'Generate this episode to create a podcast from the local demo chunks for regularization and Lasso regression.',
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
