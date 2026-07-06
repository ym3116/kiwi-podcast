import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
} from '@nestjs/common';
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

  private extractBearerToken(authorization?: string): string | null {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? null;
  }
}
