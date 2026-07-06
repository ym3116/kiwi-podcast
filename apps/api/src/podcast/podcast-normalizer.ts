import {
  KiwiDocument,
  KiwiMaterialsPayload,
  PodcastEpisode,
  PodcastResponse,
} from '../types/podcast';

const DEFAULT_SCRIPT =
  'This placeholder script will be replaced by generated podcast content. The episode will summarize the source document, highlight the main concepts, and add study prompts grounded in Kiwi course materials.';

function removeExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

function cleanDocumentName(document: KiwiDocument, index: number): string {
  const rawName =
    document.documentName?.trim() || document.fileName?.trim() || `Document ${index + 1}`;
  return removeExtension(rawName) || `Document ${index + 1}`;
}

function estimateDuration(index: number): string {
  const minutes = 8 + (index % 4) * 3;
  return `${minutes} min`;
}

function extractDocuments(payload: KiwiMaterialsPayload): KiwiDocument[] {
  if (Array.isArray(payload.materials?.documents)) {
    return payload.materials.documents;
  }

  if (Array.isArray(payload.documents)) {
    return payload.documents;
  }

  return [];
}

function isLectureDocument(document: KiwiDocument): boolean {
  const materialType = document.materialType?.trim().toLowerCase();
  return materialType === 'lecture' || materialType === 'class materials';
}

export function normalizePodcastPayload(
  classId: string,
  payload: KiwiMaterialsPayload,
): PodcastResponse {
  if (payload.error) {
    throw new Error(payload.error);
  }

  const className = payload.className?.trim() || payload.name?.trim() || 'Class';
  const documents = extractDocuments(payload).filter(isLectureDocument);
  const episodes: PodcastEpisode[] = documents.map((document, index) => {
    const lectureNumber = index + 1;
    const documentName = cleanDocumentName(document, index);
    const materialType = document.materialType?.trim() || 'document';

    return {
      id: `episode-${document.id || document.documentId || lectureNumber}`,
      documentId: document.id || document.documentId || `document-${lectureNumber}`,
      title: `Lecture ${lectureNumber} - ${documentName}`,
      lectureNumber,
      documentName,
      materialType,
      durationLabel: estimateDuration(index),
      script: DEFAULT_SCRIPT,
      status: 'placeholder',
    };
  });

  return {
    podcast: {
      id: `podcast-${classId}`,
      classId,
      title: `${className} - Podcast`,
      description:
        payload.description?.trim() ||
        'Generated lecture episodes for this Kiwi class. Podcast audio and scripts are placeholders in this version.',
      coverTheme: 'kiwi-gradient',
    },
    episodes,
  };
}
