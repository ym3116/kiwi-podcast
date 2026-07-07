import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { PodcastService } from './podcast.service';

@Controller('api/podcast')
export class PodcastController {
  constructor(@Inject(PodcastService) private readonly podcastService: PodcastService) {}

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
  getAudio(@Param('episodeId') episodeId: string, @Res() response: any) {
    const audioPath = this.podcastService.getAudioPath(episodeId);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(audioPath)
      .on('error', () => {
        if (!response.headersSent) {
          response.status(404).json({ error: 'Podcast audio not found' });
        } else {
          response.end();
        }
      })
      .pipe(response);
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
