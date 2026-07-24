import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AudioStorageService } from '../storage/audio-storage.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
  ) {}

  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'kiwi-podcast-api' };
  }

  @Get()
  getHealth() {
    return this.getReadiness();
  }

  @Get('ready')
  async getReadiness() {
    const [database, storage] = await Promise.allSettled([
      this.prisma.$queryRaw(Prisma.sql`SELECT 1`),
      this.audioStorage.healthCheck(),
    ]);

    if (database.status === 'rejected' || storage.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'kiwi-podcast-api',
        database: database.status === 'fulfilled' ? 'ok' : 'unavailable',
        storage: storage.status === 'fulfilled' ? 'ok' : 'unavailable',
      });
    }

    return {
      status: 'ok',
      service: 'kiwi-podcast-api',
      database: 'ok',
      storage: 'ok',
    };
  }
}
