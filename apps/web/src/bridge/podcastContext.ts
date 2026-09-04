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
  userRole?: string;
  canManage?: boolean;
  isSystemAdmin?: boolean;
  item: PodcastViewItem;
  selection: TranscriptContextSelection;
}

interface PodcastKiwiContextInput {
  className?: string;
  userRole?: string;
  canManage?: boolean;
  isSystemAdmin?: boolean;
  currentState: string | string[];
}

interface PodcastAdminKiwiContextInput {
  activePage: 'defaults' | 'classes';
  visibleClassCount?: number;
}

export function buildPodcastKiwiContext({
  className,
  userRole,
  canManage = false,
  isSystemAdmin = false,
  currentState,
}: PodcastKiwiContextInput): string {
  const stateLines = Array.isArray(currentState) ? currentState : [currentState];
  const currentAccess = canManage
    ? 'Class Podcast, My Podcasts, and Manage are available to this user.'
    : 'Only Class Podcast and My Podcasts are available to this user. Manage is not available.';
  const adminAccess = isSystemAdmin
    ? 'The separate system-wide Podcast Admin panel is also available to this user under Kiwi App Admin Panels.'
    : 'The separate system-wide Podcast Admin panel is not available to this user.';

  return [
    'KIWI APP CONTEXT',
    'App: Kiwi Podcast',
    'Purpose: Turn Kiwi class documents into class or personalized audio podcasts.',
    'Class: ' + (className?.trim() || 'Current Kiwi class'),
    'Current Kiwi role: ' + (userRole?.trim() || 'unknown'),
    '',
    'FEATURES AND NAVIGATION',
    '- Students use Class Podcast to listen to episodes explicitly published by a professor, instructor, or authorized administrator. Each class episode corresponds to one lecture or class document.',
    '- Students use My Podcasts, then Create podcast, to make a private personalized podcast. They enter a learning goal or prompt, select up to five available class documents, choose 5, 10, or 15 minutes, and choose beginner, intermediate, or advanced difficulty. The result appears in My Podcasts.',
    '- Students do not see or have access to Manage.',
    '- Authorized professors, instructors, and administrators also see Manage. Manage maintains one class podcast per class document: generate or edit the script, configure shared class voice defaults or per-podcast host and speaker voice overrides, render and listen to a preview, and explicitly publish the finished version. Students continue to receive only the published version.',
    '- System administrators can open Podcast Admin from Kiwi App Admin Panels. Global Defaults controls inherited system-wide host and speaker voices. All Classes shows Podcast availability, effective voice sources, published episode counts, and recent activity for classes visible to the administrator; it does not expose every podcast in full.',
    '',
    'CURRENT USER ACCESS',
    currentAccess,
    adminAccess,
    '',
    'CURRENT APP STATE',
    ...stateLines,
    '',
    'ASSISTANT CAPABILITY',
    'Use this information to explain what Kiwi Podcast can do and where the user can find each feature. The Kiwi assistant cannot press controls or operate the Podcast iframe for the user.',
  ].join('\n');
}

export function buildPodcastAdminKiwiContext({
  activePage,
  visibleClassCount,
}: PodcastAdminKiwiContextInput): string {
  const currentState = activePage === 'defaults'
    ? [
        'Current surface: Podcast Admin > Global Defaults.',
        'This page changes the system-wide host and speaker voice defaults inherited by classes without class-level or podcast-level overrides.',
      ]
    : [
        'Current surface: Podcast Admin > All Classes.',
        'Visible classes: ' + (visibleClassCount ?? 'loading or unavailable') + '.',
        'This page is an overview of Podcast availability, effective voice sources, published episode counts, and recent activity. It is not a full podcast-content browser.',
      ];

  return buildPodcastKiwiContext({
    userRole: 'system administrator',
    canManage: true,
    isSystemAdmin: true,
    currentState,
  });
}

function renderLine(label: string, line?: TimedTranscriptTurn): string {
  if (!line) return `${label}: Not available`;
  return `${label} (${line.speaker || 'Narrator'}): ${line.text}`;
}

export function buildTranscriptKiwiContext({
  className,
  userRole,
  canManage,
  isSystemAdmin,
  item,
  selection,
}: TranscriptContextInput): string {
  return buildPodcastKiwiContext({
    className,
    userRole,
    canManage,
    isSystemAdmin,
    currentState: [
    'Current state: The student paused to ask about a podcast transcript line.',
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
    ],
  });
}
