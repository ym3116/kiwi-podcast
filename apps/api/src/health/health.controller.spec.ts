import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { AudioStorageService } from '../storage/audio-storage.service';
import { HealthController } from './health.controller';

function controller(options: { database?: 'ok' | 'failed'; storage?: 'ok' | 'failed' } = {}) {
  const prisma = {
    $queryRaw:
      options.database === 'failed'
        ? vi.fn().mockRejectedValue(new Error('database unavailable'))
        : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const storage = {
    healthCheck:
      options.storage === 'failed'
        ? vi.fn().mockRejectedValue(new Error('storage unavailable'))
        : vi.fn().mockResolvedValue(undefined),
  };

  return {
    health: new HealthController(
      prisma as unknown as PrismaService,
      storage as unknown as AudioStorageService,
    ),
    prisma,
    storage,
  };
}

describe('HealthController', () => {
  it('reports liveness without checking dependencies', () => {
    const { health, prisma, storage } = controller();

    expect(health.getLiveness()).toEqual({ status: 'ok', service: 'kiwi-podcast-api' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(storage.healthCheck).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL and object storage are available', async () => {
    const { health } = controller();

    await expect(health.getReadiness()).resolves.toEqual({
      status: 'ok',
      service: 'kiwi-podcast-api',
      database: 'ok',
      storage: 'ok',
    });
  });

  it('returns a safe unavailable response without exposing dependency errors', async () => {
    const { health } = controller({ database: 'failed' });

    try {
      await health.getReadiness();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'unavailable',
        service: 'kiwi-podcast-api',
        database: 'unavailable',
        storage: 'ok',
      });
    }
  });
});

