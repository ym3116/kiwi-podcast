import {
  Controller,
  Body,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  Query,
} from '@nestjs/common';
import { PodcastService } from './podcast.service';
import { CreatePersonalPodcastInput, PersonalPodcastService } from './personal-podcast.service';
import { AudioStorageService } from '../storage/audio-storage.service';

@Controller('api/podcast')
export class PodcastController {
  constructor(
    @Inject(PodcastService) private readonly podcastService: PodcastService,
    @Inject(PersonalPodcastService) private readonly personalPodcasts: PersonalPodcastService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
  ) {}

  @Get('classes/:classId/creator/materials')
  async getCreatorMaterials(@Headers('authorization') authorization?: string) {
    this.requireBearerToken(authorization);
    return { materials: await this.personalPodcasts.listMaterials() };
  }

  @Post('classes/:classId/my-podcasts')
  async createPersonalPodcast(
    @Param('classId') classId: string,
    @Body() input: CreatePersonalPodcastInput,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return this.personalPodcasts.create(classId, input);
  }

  @Get('classes/:classId/my-podcasts')
  async listPersonalPodcasts(
    @Param('classId') classId: string,
    @Query('ownerUserId') ownerUserId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return { podcasts: await this.personalPodcasts.list(classId, ownerUserId) };
  }

  @Get('classes/:classId/my-podcasts/:podcastId')
  async getPersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Query('ownerUserId') ownerUserId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return this.personalPodcasts.get(classId, podcastId, ownerUserId);
  }

  @Post('classes/:classId/my-podcasts/:podcastId/retry')
  async retryPersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Body('ownerUserId') ownerUserId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return this.personalPodcasts.retry(classId, podcastId, ownerUserId);
  }

  @Delete('classes/:classId/my-podcasts/:podcastId')
  async deletePersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Body('ownerUserId') ownerUserId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return this.personalPodcasts.delete(classId, podcastId, ownerUserId);
  }

  @Get('my-podcasts/:podcastId/audio')
  async getPersonalAudio(
    @Param('podcastId') podcastId: string,
    @Query('ownerUserId') ownerUserId: string,
    @Res() response: any,
  ) {
    const storageKey = await this.personalPodcasts.audioStorageKey(podcastId, ownerUserId);
    const audio = await this.audioStorage.stream(storageKey);
    response.setHeader('Content-Type', audio.metadata.contentType);
    if (audio.metadata.contentLength) response.setHeader('Content-Length', audio.metadata.contentLength);
    response.setHeader('Cache-Control', 'private, max-age=300');
    audio.body.on('error', () => response.end()).pipe(response);
  }

  @Get('classes/:classId')
  async getClassPodcast(
    @Param('classId') classId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new HttpException(
        { error: 'Missing Authorization bearer token' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      return await this.podcastService.getClassPodcast(classId, accessToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load podcast episodes';
      throw new HttpException({ error: message }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('classes/:classId/episodes/:documentId/generate')
  async generateEpisode(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);

    const result = await this.podcastService.generateEpisode(classId, documentId);
    if (result.job.status === 'failed') {
      throw new HttpException(result.job, HttpStatus.BAD_GATEWAY);
    }
    return result;
  }

  @Get('classes/:classId/episodes/:documentId/status')
  async getGenerationStatus(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireBearerToken(authorization);
    return this.podcastService.getGenerationStatus(classId, documentId);
  }

  @Get('audio/:episodeId')
  async getAudio(@Param('episodeId') episodeId: string, @Res() response: any) {
    const storageKey = await this.podcastService.getAudioStorageKey(episodeId);
    if (!storageKey) {
      response.status(404).json({ error: 'Podcast audio not found' });
      return;
    }
    const audio = await this.audioStorage.stream(storageKey);
    response.setHeader('Content-Type', audio.metadata.contentType);
    if (audio.metadata.contentLength) response.setHeader('Content-Length', audio.metadata.contentLength);
    response.setHeader('Cache-Control', 'private, max-age=300');
    audio.body.on('error', () => response.end()).pipe(response);
  }

  private extractBearerToken(authorization?: string): string | null {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? null;
  }

  private requireBearerToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new HttpException(
        { error: 'Missing Authorization bearer token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return accessToken;
  }
}
