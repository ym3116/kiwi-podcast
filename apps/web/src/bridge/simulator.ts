import { DemoMaterial, PodcastResponse, PodcastTranscriptTurn } from '../types/podcast';
import { KiwiAppToken, KiwiContext } from './types';
import simulatorPodcastFixture from './simulatorPodcastFixture.json';

export const simulatorContext: KiwiContext = {
  classId: '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
  className: 'Regularization',
  userId: 'sim-user-1',
  username: 'Student Demo',
  userRole: 'student',
  appId: 'sim-app-podcasts',
  appSlug: 'podcasts',
  uiSlug: 'student',
  capabilities: ['ai', 'mcp'],
};

export const simulatorToken: KiwiAppToken = {
  accessToken: 'simulated-kiwi-app-token',
  scopes: [
    'user:profile:read',
    'class:info:read',
    'class:enrollments:read',
    'class:materials:chunks:read',
    'podcast:manage',
  ],
  expiresIn: 3600,
  appSlug: 'podcasts',
};

const simulatorTranscript = simulatorPodcastFixture.transcript as PodcastTranscriptTurn[];

export const simulatorMaterial: DemoMaterial = {
  id: simulatorPodcastFixture.documentId,
  documentId: simulatorPodcastFixture.documentId,
  documentName: simulatorPodcastFixture.documentName,
  materialId: simulatorPodcastFixture.materialId,
  materialType: simulatorPodcastFixture.materialType,
  chunkCount: simulatorPodcastFixture.chunkCount,
  pageCount: simulatorPodcastFixture.pageCount,
  preview: simulatorPodcastFixture.preview,
};

export const simulatorMaterials: DemoMaterial[] = [simulatorMaterial];

export const simulatorPodcast: PodcastResponse = {
  podcast: {
    id: 'podcast-1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
    classId: simulatorContext.classId!,
    title: `${simulatorContext.className} - Podcast`,
    description: simulatorPodcastFixture.summary,
    coverTheme: 'kiwi-gradient',
  },
  episodes: [
    {
      id: 'episode-49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
      documentId: simulatorPodcastFixture.documentId,
      title: simulatorPodcastFixture.title,
      lectureNumber: 1,
      documentName: simulatorPodcastFixture.documentName,
      materialType: simulatorPodcastFixture.materialType,
      durationLabel: '2:35',
      status: 'ready',
      audioUrl: '/demo/regularization-lasso.mp3',
      script: simulatorTranscript
        .map((turn) => `${turn.speaker}: ${turn.text}`)
        .join('\n\n'),
      transcript: simulatorTranscript,
    },
  ],
};
