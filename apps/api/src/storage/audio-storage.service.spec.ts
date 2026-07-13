import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AudioStorageService, createAudioS3Client } from './audio-storage.service';

describe('AudioStorageService', () => {
  it('fails clearly when MinIO configuration is missing', () => {
    const original = {
      endpoint: process.env.MINIO_ENDPOINT,
      access: process.env.MINIO_ACCESS_KEY,
      secret: process.env.MINIO_SECRET_KEY,
    };
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
    expect(() => createAudioS3Client()).toThrow('MinIO configuration is required');
    if (original.endpoint) process.env.MINIO_ENDPOINT = original.endpoint;
    else delete process.env.MINIO_ENDPOINT;
    if (original.access) process.env.MINIO_ACCESS_KEY = original.access;
    else delete process.env.MINIO_ACCESS_KEY;
    if (original.secret) process.env.MINIO_SECRET_KEY = original.secret;
    else delete process.env.MINIO_SECRET_KEY;
  });

  it('creates a missing bucket and supports the object lifecycle', async () => {
    const send = vi.fn(async (command: object) => {
      const name = command.constructor.name;
      if (name === 'HeadBucketCommand' && send.mock.calls.length === 1) {
        throw Object.assign(new Error('missing'), { name: 'NotFound' });
      }
      if (name === 'GetObjectCommand') {
        return {
          Body: Readable.from(Buffer.from('mp3')),
          ContentType: 'audio/mpeg',
          ContentLength: 3,
        };
      }
      return {};
    });
    const service = new AudioStorageService({ send } as never);

    await service.onModuleInit();
    await service.upload('personal/user/podcast.mp3', Buffer.from('mp3'));
    const result = await service.stream('personal/user/podcast.mp3');
    expect(result.metadata).toEqual({ contentType: 'audio/mpeg', contentLength: 3 });
    expect(await service.exists('personal/user/podcast.mp3')).toBe(true);
    await service.delete('personal/user/podcast.mp3');

    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'HeadBucketCommand',
      'CreateBucketCommand',
      'PutObjectCommand',
      'GetObjectCommand',
      'HeadObjectCommand',
      'DeleteObjectCommand',
    ]);
  });

  it('reports missing objects without throwing', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
    });
    const service = new AudioStorageService({ send } as never);
    await expect(service.exists('missing.mp3')).resolves.toBe(false);
  });
});
