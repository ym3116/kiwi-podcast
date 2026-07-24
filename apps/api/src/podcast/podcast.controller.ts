import {
  Controller,
  Body,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { PodcastService } from './podcast.service';
import { CreatePersonalPodcastInput, PersonalPodcastService } from './personal-podcast.service';
import { AudioStorageService } from '../storage/audio-storage.service';
import { PodcastAccessAuthService } from './podcast-access-auth.service';

@Controller('api/podcast')
export class PodcastController {
  constructor(
    @Inject(PodcastService) private readonly podcastService: PodcastService,
    @Inject(PersonalPodcastService) private readonly personalPodcasts: PersonalPodcastService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
    @Inject(PodcastAccessAuthService) private readonly auth: PodcastAccessAuthService,
  ) {}

  @Get('classes/:classId/creator/materials')
  async getCreatorMaterials(
    @Param('classId') classId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization, [
      'class:info:read',
      'class:materials:chunks:read',
    ]);
    return {
      materials: await this.personalPodcasts.listMaterials(classId, principal.accessToken),
    };
  }

  @Post('classes/:classId/my-podcasts')
  async createPersonalPodcast(
    @Param('classId') classId: string,
    @Body() input: CreatePersonalPodcastInput,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization, [
      'class:info:read',
      'class:materials:chunks:read',
    ]);
    return this.personalPodcasts.create(
      classId,
      principal.userId,
      input,
      principal.accessToken,
    );
  }

  @Get('classes/:classId/my-podcasts')
  async listPersonalPodcasts(
    @Param('classId') classId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    return { podcasts: await this.personalPodcasts.list(classId, principal.userId) };
  }

  @Get('classes/:classId/my-podcasts/:podcastId')
  async getPersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    return this.personalPodcasts.get(classId, podcastId, principal.userId);
  }

  @Post('classes/:classId/my-podcasts/:podcastId/retry')
  async retryPersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization, [
      'class:info:read',
      'class:materials:chunks:read',
    ]);
    return this.personalPodcasts.retry(
      classId,
      podcastId,
      principal.userId,
      principal.accessToken,
    );
  }

  @Delete('classes/:classId/my-podcasts/:podcastId')
  async deletePersonalPodcast(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    return this.personalPodcasts.delete(classId, podcastId, principal.userId);
  }

  @Get('classes/:classId/my-podcasts/:podcastId/audio')
  async getPersonalAudio(
    @Param('classId') classId: string,
    @Param('podcastId') podcastId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: any,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    const storageKey = await this.personalPodcasts.audioStorageKey(
      classId,
      podcastId,
      principal.userId,
    );
    await this.streamAudio(storageKey, range, response);
  }

  @Get('classes/:classId')
  async getClassPodcast(
    @Param('classId') classId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    this.requireLiveClass(principal.mode);

    try {
      return await this.podcastService.getClassPodcast(classId, principal.accessToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load podcast episodes';
      throw new HttpException({ error: message }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('classes/:classId/episodes/:documentId/status')
  async getGenerationStatus(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    this.requireLiveClass(principal.mode);
    return this.podcastService.getGenerationStatus(classId, documentId);
  }

  @Get('classes/:classId/audio/:episodeId')
  async getAudio(
    @Param('classId') classId: string,
    @Param('episodeId') episodeId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: any,
  ) {
    const principal = await this.auth.authorize(classId, authorization);
    this.requireLiveClass(principal.mode);
    const storageKey = await this.podcastService.getAudioStorageKey(classId, episodeId);
    if (!storageKey) {
      response.status(404).json({ error: 'Podcast audio not found' });
      return;
    }
    await this.streamAudio(storageKey, range, response);
  }

  private async streamAudio(storageKey: string, requestedRange: string | undefined, response: any) {
    const range = this.normalizeRange(requestedRange);
    if (requestedRange && !range) {
      response.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
      return;
    }
    const audio = await this.audioStorage.stream(storageKey, range);
    response.setHeader('Content-Type', audio.metadata.contentType);
    if (audio.metadata.contentLength) response.setHeader('Content-Length', audio.metadata.contentLength);
    if (audio.metadata.contentRange) response.setHeader('Content-Range', audio.metadata.contentRange);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store');
    if (range && audio.metadata.contentRange) response.status(HttpStatus.PARTIAL_CONTENT);
    audio.body.on('error', () => response.end()).pipe(response);
  }

  private normalizeRange(range?: string): string | undefined {
    const normalized = range?.trim();
    return normalized && /^bytes=(?:\d+-\d*|-\d+)$/.test(normalized) ? normalized : undefined;
  }

  private requireLiveClass(mode: 'live' | 'simulator') {
    if (mode === 'simulator') {
      throw new ForbiddenException('Simulator access cannot read live class podcasts');
    }
  }

}
