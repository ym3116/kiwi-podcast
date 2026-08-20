import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';

interface AdminAppTokenClaims {
  sub?: string;
  type?: string;
  appSlug?: string;
  classId?: string | null;
  tokenScope?: string;
  scopes?: string[];
  exp?: number;
}

export interface PodcastAdminPrincipal {
  userId: string;
  scopes: Set<string>;
  accessToken: string;
}

@Injectable()
export class PodcastAdminAuthService {
  constructor(@Inject(KiwiMcpClient) private readonly kiwi: KiwiMcpClient) {}

  async authorize(authorization?: string): Promise<PodcastAdminPrincipal> {
    const accessToken = this.bearerToken(authorization);
    let authenticated: unknown;
    try {
      authenticated = await this.kiwi.callTool(accessToken, 'get_authenticated_user');
    } catch {
      throw new UnauthorizedException('Kiwi rejected or expired the app token');
    }

    const user = authenticated as { id?: string; systemRole?: string } | null;
    const claims = this.decodeClaims(accessToken);
    if (!user?.id || claims.type !== 'app_token' || claims.sub !== user.id) {
      throw new UnauthorizedException(
        'Podcast admin access requires a Kiwi app token for the authenticated user',
      );
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Kiwi app token is expired');
    }
    if (claims.appSlug !== 'kiwi-podcast') {
      throw new ForbiddenException('Token was issued for a different Kiwi app');
    }
    if (user.systemRole !== 'admin') {
      throw new ForbiddenException('Podcast global administration is limited to system admins');
    }

    const isClasslessAdminToken = claims.classId === null && claims.tokenScope === 'admin';
    const isClassAuthorizedToken = typeof claims.classId === 'string'
      && claims.classId.length > 0
      && (claims.tokenScope === 'class' || claims.tokenScope === undefined);
    if (!isClasslessAdminToken && !isClassAuthorizedToken) {
      throw new ForbiddenException(
        'Podcast global administration requires a classless admin token or a class-scoped system-admin token',
      );
    }

    const scopes = new Set(Array.isArray(claims.scopes) ? claims.scopes : []);
    if (!this.hasScope(scopes, 'podcast:manage')) {
      throw new ForbiddenException('Missing required podcast scope: podcast:manage');
    }
    return { userId: user.id, scopes, accessToken };
  }

  private bearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match?.[1]) {
      throw new UnauthorizedException('Missing or malformed Authorization bearer token');
    }
    return match[1];
  }

  private decodeClaims(token: string): AdminAppTokenClaims {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[1]) throw new Error('invalid token shape');
      const claims = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as AdminAppTokenClaims;
      if (!claims || typeof claims !== 'object') throw new Error('invalid token claims');
      return claims;
    } catch {
      throw new UnauthorizedException('Malformed Kiwi app token');
    }
  }

  private hasScope(grantedScopes: Set<string>, requiredScope: string): boolean {
    if (grantedScopes.has(requiredScope) || grantedScopes.has('*')) return true;
    return [...grantedScopes].some(
      (granted) => granted.endsWith(':*') && requiredScope.startsWith(granted.slice(0, -1)),
    );
  }
}
