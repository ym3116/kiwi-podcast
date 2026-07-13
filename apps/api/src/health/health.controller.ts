import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { AudioStorageService } from '../storage/audio-storage.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(AudioStorageService) private readonly audioStorage: AudioStorageService) {}

  @Get()
  async getHealth() {
    try {
      await this.audioStorage.healthCheck();
      return { status: 'ok', service: 'kiwi-podcast-api', storage: 'ok' };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'kiwi-podcast-api',
        storage: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
