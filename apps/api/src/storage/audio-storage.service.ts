import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export interface AudioObjectMetadata {
  contentType: string;
  contentLength?: number;
  contentRange?: string;
}

export interface AudioStorage {
  upload(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  stream(key: string, range?: string): Promise<{ body: Readable; metadata: AudioObjectMetadata }>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  healthCheck(): Promise<void>;
}

export const AUDIO_S3_CLIENT = 'AUDIO_S3_CLIENT';

export function createAudioS3Client(): S3Client {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'MinIO configuration is required: MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY',
    );
  }
  return new S3Client({
    endpoint,
    region: process.env.MINIO_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

@Injectable()
export class AudioStorageService implements AudioStorage, OnModuleInit {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(@Inject(AUDIO_S3_CLIENT) client: S3Client) {
    this.bucket = process.env.MINIO_BUCKET ?? 'kiwi-podcasts';
    this.client = client;
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  async upload(key: string, bytes: Buffer, contentType = 'audio/mpeg') {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  }

  async stream(key: string, range?: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: range } : {}) }),
    );
    if (!(result.Body instanceof Readable)) throw new Error(`Audio object ${key} is not streamable`);
    return {
      body: result.Body,
      metadata: {
        contentType: result.ContentType ?? 'audio/mpeg',
        contentLength: result.ContentLength,
        contentRange: result.ContentRange,
      },
    };
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async healthCheck() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private async ensureBucket() {
    try {
      await this.healthCheck();
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private isNotFound(error: unknown) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return candidate.name === 'NotFound' || candidate.name === 'NoSuchBucket' || candidate.$metadata?.httpStatusCode === 404;
  }
}
