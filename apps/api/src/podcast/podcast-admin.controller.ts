import { Body, Controller, Get, Headers, Inject, Patch, Post, Res } from '@nestjs/common';
import { PodcastAdminAuthService } from './podcast-admin-auth.service';
import { PodcastGlobalSettingsService } from './podcast-global-settings.service';
import { PodcastAdminClassesService } from './podcast-admin-classes.service';

@Controller('api/podcast/admin')
export class PodcastAdminController {
  constructor(
    @Inject(PodcastAdminAuthService) private readonly auth: PodcastAdminAuthService,
    @Inject(PodcastGlobalSettingsService)
    private readonly settings: PodcastGlobalSettingsService,
    @Inject(PodcastAdminClassesService)
    private readonly classes: PodcastAdminClassesService,
  ) {}

  @Get('classes')
  async getClasses(@Headers('authorization') authorization?: string) {
    const principal = await this.auth.authorize(authorization);
    return this.classes.list(principal.accessToken);
  }

  @Get('defaults')
  async getDefaults(@Headers('authorization') authorization?: string) {
    await this.auth.authorize(authorization);
    return this.settings.getState();
  }

  @Patch('defaults')
  async updateDefaults(
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    const principal = await this.auth.authorize(authorization);
    return this.settings.update(body, principal.userId);
  }

  @Post('voice-preview')
  async voicePreview(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: any,
  ) {
    await this.auth.authorize(authorization);
    const wav = await this.settings.preview(body);
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', wav.byteLength);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(wav);
  }
}
