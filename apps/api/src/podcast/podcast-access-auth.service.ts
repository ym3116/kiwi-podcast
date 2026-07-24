import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { SIMULATOR_ACCESS_TOKEN } from './podcast-chunk-source.service';

export const PODCAST_ROLES = ['student', 'ta', 'professor', 'instructor', 'admin'] as const;
export type PodcastRole = (typeof PODCAST_ROLES)[number];

export interface PodcastPrincipal {
  userId: string;
  classId: string;
  role: PodcastRole;
  scopes: Set<string>;
  accessToken: string;
  mode: 'live' | 'simulator';
}

interface AppTokenClaims {
  sub?: string;
  type?: string;
  appSlug?: string;
  classId?: string;
  scopes?: string[];
  exp?: number;
}

interface CachedPrincipal {
  principal: PodcastPrincipal;
  expiresAt: number;
}

@Injectable()
export class PodcastAccessAuthService {
  private readonly cache = new Map<string, CachedPrincipal>();
  private readonly cacheTtlMs = 15_000;

  constructor(@Inject(KiwiMcpClient) private readonly kiwi: KiwiMcpClient) {}

  async authorize(
    classId: string,
    authorization?: string,
    requiredScopes: string[] = ['class:info:read'],
  ): Promise<PodcastPrincipal> {
    const accessToken = this.bearerToken(authorization);
    if (accessToken === SIMULATOR_ACCESS_TOKEN) {
      const principal = this.simulatorPrincipal(classId, accessToken);
      const missingScope = requiredScopes.find((scope) => !this.hasScope(principal.scopes, scope));
      if (missingScope) {
        throw new ForbiddenException(`Missing required podcast scope: ${missingScope}`);
      }
      return principal;
    }

    const cacheKey = createHash('sha256').update(accessToken).digest('hex');
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    let principal: PodcastPrincipal;
    if (cached && cached.expiresAt > now && cached.principal.classId === classId) {
      principal = cached.principal;
    } else {
      if (cached) this.cache.delete(cacheKey);
      const verified = await this.verify(classId, accessToken);
      principal = verified.principal;
      const expiresAt = Math.min(now + this.cacheTtlMs, verified.tokenExpiry);
      if (expiresAt > now) this.cache.set(cacheKey, { principal, expiresAt });
    }

    const missingScope = requiredScopes.find((scope) => !this.hasScope(principal.scopes, scope));
    if (missingScope) {
      throw new ForbiddenException(`Missing required podcast scope: ${missingScope}`);
    }
    return principal;
  }

  private async verify(
    classId: string,
    accessToken: string,
  ): Promise<{ principal: PodcastPrincipal; tokenExpiry: number }> {
    let authenticated: unknown;
    try {
      authenticated = await this.kiwi.callTool(accessToken, 'get_authenticated_user');
    } catch {
      throw new UnauthorizedException('Kiwi rejected or expired the app token');
    }

    const userId = (authenticated as { id?: string } | null)?.id;
    if (!userId) throw new UnauthorizedException('Kiwi did not return an authenticated user');

    const claims = this.decodeClaims(accessToken);
    if (claims.type !== 'app_token' || claims.sub !== userId) {
      throw new UnauthorizedException(
        'Podcast access requires a Kiwi app token for the authenticated user',
      );
    }
    if (claims.appSlug !== 'kiwi-podcast') {
      throw new ForbiddenException('Token was issued for a different Kiwi app');
    }
    if (claims.classId !== classId) {
      throw new ForbiddenException('Token is scoped to a different class');
    }

    let rawRole: string | null;
    try {
      rawRole = await this.kiwi.getClassRole(userId, classId);
    } catch {
      throw new BadGatewayException('Unable to verify Kiwi class membership');
    }
    if (!this.isPodcastRole(rawRole)) {
      throw new ForbiddenException('The authenticated user is not a member of this class');
    }

    return {
      principal: {
        userId,
        classId,
        role: rawRole,
        scopes: new Set(Array.isArray(claims.scopes) ? claims.scopes : []),
        accessToken,
        mode: 'live',
      },
      tokenExpiry:
        typeof claims.exp === 'number' ? claims.exp * 1000 : Number.POSITIVE_INFINITY,
    };
  }

  private bearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match?.[1]) {
      throw new UnauthorizedException('Missing or malformed Authorization bearer token');
    }
    return match[1];
  }

  private simulatorPrincipal(classId: string, accessToken: string): PodcastPrincipal {
    const simulatorClassId =
      process.env.PODCAST_SIMULATOR_CLASS_ID ?? '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31';
    if (classId !== simulatorClassId) {
      throw new ForbiddenException('The Simulator token is scoped to the demo class only');
    }
    return {
      userId: process.env.PODCAST_SIMULATOR_USER_ID ?? 'sim-user-1',
      classId,
      role: 'student',
      scopes: new Set(['class:info:read', 'class:materials:chunks:read']),
      accessToken,
      mode: 'simulator',
    };
  }

  private decodeClaims(token: string): AppTokenClaims {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[1]) throw new Error('invalid token shape');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as AppTokenClaims;
      if (!claims || typeof claims !== 'object') throw new Error('invalid token claims');
      return claims;
    } catch {
      throw new UnauthorizedException('Malformed Kiwi app token');
    }
  }

  private isPodcastRole(role: string | null): role is PodcastRole {
    return Boolean(role && (PODCAST_ROLES as readonly string[]).includes(role));
  }

  private hasScope(grantedScopes: Set<string>, requiredScope: string): boolean {
    if (grantedScopes.has(requiredScope) || grantedScopes.has('*')) return true;
    return [...grantedScopes].some(
      (granted) => granted.endsWith(':*') && requiredScope.startsWith(granted.slice(0, -1)),
    );
  }
}
