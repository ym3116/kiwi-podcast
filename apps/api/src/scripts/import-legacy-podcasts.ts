import '../env';
import { Prisma, PrismaClient, PodcastJobStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { GeneratedPodcastScript, PodcastJob } from '../podcast/podcast-generation.types';

const prisma = new PrismaClient();

const legacyRoot = path.resolve(
  process.env.LEGACY_PODCAST_STORAGE_DIR ?? 'apps/api/apps/api/.podcasts',
);
const audioRoot = path.resolve(process.env.PODCAST_AUDIO_DIR ?? 'apps/api/.podcasts/audio');
const demoChunkDir = path.resolve(process.env.PODCAST_DEMO_CHUNKS_DIR ?? 'apps/api/demo-chunks');

async function main() {
  const jobsDir = path.join(legacyRoot, 'jobs');
  const jobFiles = await listJsonFiles(jobsDir);
  if (jobFiles.length === 0) {
    console.log(`No legacy podcast jobs found in ${jobsDir}`);
    return;
  }

  let imported = 0;
  for (const jobFile of jobFiles) {
    const job = JSON.parse(await readFile(jobFile, 'utf8')) as PodcastJob;
    await importJob(job);
    imported += 1;
  }

  console.log(`Imported ${imported} legacy podcast job(s) into PostgreSQL.`);
}

async function importJob(job: PodcastJob) {
  const script = await readLegacyScript(job.episodeId);
  const documentName = (await readDemoDocumentName(job.documentId)) ?? job.documentId;
  const generatedAt = job.generatedAt ? new Date(job.generatedAt) : new Date(job.updatedAt);
  const status = toPrismaStatus(job.status);
  const audioPath = await copyLegacyAudio(job.episodeId);

  await prisma.podcastClass.upsert({
    where: { classId: job.classId },
    create: {
      classId: job.classId,
      title: `${job.classId} Podcast`,
      description: 'Generated lecture episodes imported from local legacy artifacts.',
      coverTheme: 'kiwi-gradient',
    },
    update: {},
  });

  const document = await prisma.sourceDocument.upsert({
    where: {
      classId_kiwiDocumentId: {
        classId: job.classId,
        kiwiDocumentId: job.documentId,
      },
    },
    create: {
      classId: job.classId,
      kiwiDocumentId: job.documentId,
      documentName,
      materialType: 'class materials',
      lectureNumber: 0,
    },
    update: {
      documentName,
      materialType: 'class materials',
    },
  });

  await prisma.podcastEpisode.upsert({
    where: { episodeId: job.episodeId },
    create: {
      episodeId: job.episodeId,
      classId: job.classId,
      kiwiDocumentId: job.documentId,
      sourceDocumentId: document.id,
      title: script?.title ?? `Podcast episode for ${job.documentId}`,
      durationLabel: script ? `${script.durationTargetMinutes} min` : '0 min',
      status,
      generatedAt: status === 'ready' ? generatedAt : null,
      errorMessage: job.errorMessage,
    },
    update: {
      classId: job.classId,
      kiwiDocumentId: job.documentId,
      sourceDocumentId: document.id,
      title: script?.title ?? `Podcast episode for ${job.documentId}`,
      durationLabel: script ? `${script.durationTargetMinutes} min` : '0 min',
      status,
      generatedAt: status === 'ready' ? generatedAt : null,
      errorMessage: job.errorMessage,
    },
  });

  const generationJob =
    (await prisma.generationJob.findFirst({
      where: { episodeId: job.episodeId, status },
      orderBy: { createdAt: 'desc' },
    })) ??
    (await prisma.generationJob.create({
      data: {
        episodeId: job.episodeId,
        classId: job.classId,
        kiwiDocumentId: job.documentId,
        status,
        errorMessage: job.errorMessage,
        startedAt: generatedAt,
        finishedAt: status === 'ready' || status === 'failed' ? generatedAt : null,
        inputMetadata: { importedFrom: legacyRoot },
      },
    }));

  if (script) {
    await prisma.podcastScript.upsert({
      where: { jobId: generationJob.id },
      create: {
        episodeId: job.episodeId,
        jobId: generationJob.id,
        title: script.title,
        summary: script.summary,
        durationTargetMinutes: script.durationTargetMinutes,
        turns: script.turns as unknown as Prisma.InputJsonValue,
      },
      update: {
        title: script.title,
        summary: script.summary,
        durationTargetMinutes: script.durationTargetMinutes,
        turns: script.turns as unknown as Prisma.InputJsonValue,
      },
    });
  }

  if (audioPath) {
    const audio = await readFile(audioPath);
    await prisma.podcastAudioAsset.upsert({
      where: { jobId: generationJob.id },
      create: {
        episodeId: job.episodeId,
        jobId: generationJob.id,
        storageKey: `${safeId(job.episodeId)}.mp3`,
        filePath: audioPath,
        mimeType: 'audio/mpeg',
        byteSize: audio.byteLength,
        checksum: createHash('sha256').update(audio).digest('hex'),
      },
      update: {
        filePath: audioPath,
        byteSize: audio.byteLength,
        checksum: createHash('sha256').update(audio).digest('hex'),
      },
    });
  }
}

async function readLegacyScript(episodeId: string): Promise<GeneratedPodcastScript | null> {
  const scriptPath = path.join(legacyRoot, 'scripts', `${safeId(episodeId)}.json`);
  try {
    return JSON.parse(await readFile(scriptPath, 'utf8')) as GeneratedPodcastScript;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function copyLegacyAudio(episodeId: string): Promise<string | null> {
  const sourcePath = path.join(legacyRoot, 'audio', `${safeId(episodeId)}.mp3`);
  try {
    await stat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const targetPath = path.join(audioRoot, `${safeId(episodeId)}.mp3`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return targetPath;
}

async function readDemoDocumentName(documentId: string): Promise<string | null> {
  const filePath = path.join(demoChunkDir, `${safeId(documentId)}.json`);
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8')) as { documentName?: string };
    return payload.documentName ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith('.json')).map((entry) => path.join(dir, entry));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function toPrismaStatus(status: string): PodcastJobStatus {
  if (
    status === 'placeholder' ||
    status === 'generating' ||
    status === 'ready' ||
    status === 'failed'
  ) {
    return status;
  }
  throw new Error(`Unsupported legacy job status: ${status}`);
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(`Unsafe podcast artifact ID: ${id}`);
  }
  return id;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
