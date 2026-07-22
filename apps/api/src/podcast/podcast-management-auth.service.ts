import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { AuthenticatedManager } from './podcast-management.types';

interface AppTokenClaims {
  sub?: string;
  type?: string;
  appSlug?: string;
  classId?: string;
  scopes?: string[];
}

@Injectable()
export class PodcastManagementAuthService {
  constructor(@Inject(KiwiMcpClient) private readonly kiwi: KiwiMcpClient) {}

  async authorize(classId: string, accessToken: string): Promise<AuthenticatedManager> {
    let authenticated: unknown;
    try {
      authenticated = await this.kiwi.callTool(accessToken, 'get_authenticated_user');
    } catch {
      throw new UnauthorizedException('Kiwi rejected the app token');
    }

    const userId = (authenticated as { id?: string } | null)?.id;
    if (!userId) throw new UnauthorizedException('Kiwi did not return an authenticated user');

    const claims = this.decodeClaims(accessToken);
    if (claims.sub !== userId || claims.type !== 'app_token') {
      throw new UnauthorizedException('Management requires a Kiwi app token');
    }
    if (claims.appSlug !== 'kiwi-podcast') {
      throw new ForbiddenException('Token was issued for a different Kiwi app');
    }
    if (claims.classId !== classId) {
      throw new ForbiddenException('Token is scoped to a different class');
    }
    const scopes = new Set(claims.scopes ?? []);
    if (!scopes.has('podcast:manage') || !scopes.has('class:info:read')) {
      throw new ForbiddenException('Podcast management scopes are not enabled for this class');
    }

    const role = await this.kiwi.getClassRole(userId, classId);
    if (role !== 'admin' && role !== 'professor' && role !== 'instructor') {
      throw new ForbiddenException('Podcast management is limited to admins and professors');
    }
    return { userId, role: role === 'admin' ? 'admin' : 'professor' };
  }

  private decodeClaims(token: string): AppTokenClaims {
    try {
      const payload = token.split('.')[1];
      if (!payload) throw new Error('missing payload');
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AppTokenClaims;
    } catch {
      throw new UnauthorizedException('Malformed Kiwi app token');
    }
  }
}
