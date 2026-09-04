import {
  BadGatewayException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PodcastAccessAuthService } from './podcast-access-auth.service';

describe('PodcastAccessAuthService', () => {
  it.each(['student', 'ta', 'professor', 'instructor', 'admin'])(
    'verifies a %s and returns a server-owned principal',
    async (role) => {
      const kiwi = client(role);
      const service = new PodcastAccessAuthService(kiwi as unknown as KiwiMcpClient);

      await expect(service.authorize('class-1', bearer())).resolves.toMatchObject({
        userId: 'user-1',
        classId: 'class-1',
        role,
        accessToken: token(),
      });
      expect(kiwi.callTool).toHaveBeenCalledWith(token(), 'get_authenticated_user');
      expect(kiwi.getClassRole).toHaveBeenCalledWith('user-1', 'class-1');
    },
  );

  it.each([undefined, '', 'token', 'Basic token', 'Bearer '])(
    'rejects a missing or malformed header: %s',
    async (authorization) => {
      const service = new PodcastAccessAuthService(client('student') as unknown as KiwiMcpClient);
      await expect(service.authorize('class-1', authorization)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects a token that Kiwi does not authenticate', async () => {
    const kiwi = client('student');
    kiwi.callTool.mockRejectedValueOnce(new Error('expired'));
    const service = new PodcastAccessAuthService(kiwi as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', bearer())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['wrong token type', { type: 'session' }, UnauthorizedException],
    ['wrong subject', { sub: 'another-user' }, UnauthorizedException],
    ['wrong app', { appSlug: 'another-app' }, ForbiddenException],
    ['wrong class', { classId: 'class-2' }, ForbiddenException],
  ] as const)('rejects %s', async (_label, overrides, errorType) => {
    const service = new PodcastAccessAuthService(client('student') as unknown as KiwiMcpClient);
    await expect(
      service.authorize('class-1', bearer(overrides)),
    ).rejects.toBeInstanceOf(errorType);
  });

  it('rejects a missing required scope', async () => {
    const service = new PodcastAccessAuthService(client('student') as unknown as KiwiMcpClient);
    await expect(
      service.authorize('class-1', bearer({ scopes: ['class:info:read'] }), [
        'class:materials:chunks:read',
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts Kiwi scope wildcards documented by the app protocol', async () => {
    const service = new PodcastAccessAuthService(client('student') as unknown as KiwiMcpClient);
    await expect(
      service.authorize(
        'class-1',
        bearer({ scopes: ['class:*'] }),
        ['class:info:read', 'class:materials:chunks:read'],
      ),
    ).resolves.toMatchObject({ userId: 'user-1', classId: 'class-1' });
  });

  it('rejects a user without a recognized class role', async () => {
    const service = new PodcastAccessAuthService(client(null) as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', bearer())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reports a Kiwi permissions outage separately from denied access', async () => {
    const kiwi = client('student');
    kiwi.getClassRole.mockRejectedValueOnce(new Error('offline'));
    const service = new PodcastAccessAuthService(kiwi as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', bearer())).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('uses a short positive cache without exposing the raw token as the key', async () => {
    const kiwi = client('student');
    const service = new PodcastAccessAuthService(kiwi as unknown as KiwiMcpClient);
    await service.authorize('class-1', bearer());
    await service.authorize('class-1', bearer());
    expect(kiwi.callTool).toHaveBeenCalledTimes(1);
    expect(kiwi.getClassRole).toHaveBeenCalledTimes(1);
  });

  it('keeps the exact standalone Simulator token isolated to its demo class', async () => {
    const kiwi = client('student');
    const service = new PodcastAccessAuthService(kiwi as unknown as KiwiMcpClient);
    const simulatorHeader = 'Bearer simulated-kiwi-app-token';

    await expect(
      service.authorize(
        '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
        simulatorHeader,
        ['class:materials:chunks:read'],
      ),
    ).resolves.toMatchObject({
      userId: 'sim-user-1',
      role: 'student',
      accessToken: 'simulated-kiwi-app-token',
    });
    await expect(
      service.authorize('real-class', simulatorHeader),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.authorize(
        '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
        simulatorHeader,
        ['podcast:manage'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(kiwi.callTool).not.toHaveBeenCalled();
  });
});

function client(role: string | null) {
  return {
    callTool: vi.fn().mockResolvedValue({ id: 'user-1' }),
    getClassRole: vi.fn().mockResolvedValue(role),
  };
}

function token(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      type: 'app_token',
      appSlug: 'podcasts',
      classId: 'class-1',
      scopes: ['class:info:read', 'class:materials:chunks:read', 'podcast:manage'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

function bearer(overrides: Record<string, unknown> = {}) {
  return `Bearer ${token(overrides)}`;
}
