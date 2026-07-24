import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  PodcastAccessAuthService,
  PodcastPrincipal,
} from './podcast-access-auth.service';

@Injectable()
export class PodcastManagementAuthService {
  constructor(@Inject(PodcastAccessAuthService) private readonly access: PodcastAccessAuthService) {}

  async authorize(classId: string, authorization?: string): Promise<PodcastPrincipal> {
    const principal = await this.access.authorize(classId, authorization, [
      'class:info:read',
      'podcast:manage',
    ]);
    if (!['admin', 'professor', 'instructor'].includes(principal.role)) {
      throw new ForbiddenException(
        'Podcast management is limited to admins, professors, and instructors',
      );
    }
    return principal;
  }
}
