import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AudioStorageService } from '../storage/audio-storage.service';
import { PodcastManagementAuthService } from './podcast-management-auth.service';
import { UpdateManagedEpisodeInput } from './podcast-management.types';
import { PodcastManagementService } from './podcast-management.service';

@Controller('api/podcast/classes/:classId/manage')
export class PodcastManagementController {
  constructor(
    @Inject(PodcastManagementAuthService) private readonly auth: PodcastManagementAuthService,
    @Inject(PodcastManagementService) private readonly management: PodcastManagementService,
    @Inject(AudioStorageService) private readonly audioStorage: AudioStorageService,
  ) {}

  @Get()
  async getState(
    @Param('classId') classId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const token = this.token(authorization);
    await this.auth.authorize(classId, token);
    return this.management.getState(classId, token);
  }

  @Patch('defaults')
  async updateDefaults(
    @Param('classId') classId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.updateDefaults(classId, body);
  }

  @Patch('episodes/:documentId')
  async updateEpisode(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Body() body: UpdateManagedEpisodeInput,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.updateEpisode(classId, documentId, body);
  }

  @Post('episodes/:documentId/draft/generate')
  async generateDraft(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const token = this.token(authorization);
    await this.auth.authorize(classId, token);
    return this.management.generateDraft(classId, documentId, token);
  }

  @Post('episodes/:documentId/render')
  async render(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.startRender(classId, documentId);
  }

  @Get('jobs/:jobId')
  async getJob(
    @Param('classId') classId: string,
    @Param('jobId') jobId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.getJob(classId, jobId);
  }

  @Get('jobs/:jobId/audio')
  async previewAudio(
    @Param('classId') classId: string,
    @Param('jobId') jobId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: any,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    const key = await this.management.jobAudioKey(classId, jobId);
    const audio = await this.audioStorage.stream(key);
    response.setHeader('Content-Type', audio.metadata.contentType);
    if (audio.metadata.contentLength) response.setHeader('Content-Length', audio.metadata.contentLength);
    audio.body.on('error', () => response.end()).pipe(response);
  }

  @Post('episodes/:documentId/publish')
  async publish(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Body('jobId') jobId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.publish(classId, documentId, jobId);
  }

  @Delete('episodes/:documentId')
  async reset(
    @Param('classId') classId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    return this.management.resetEpisode(classId, documentId);
  }

  @Post('voice-preview')
  async voicePreview(
    @Param('classId') classId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: any,
  ) {
    await this.auth.authorize(classId, this.token(authorization));
    const wav = await this.management.previewVoice(body);
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', wav.byteLength);
    response.send(wav);
  }

  private token(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) throw new UnauthorizedException('Missing Authorization bearer token');
    return match[1];
  }
}
