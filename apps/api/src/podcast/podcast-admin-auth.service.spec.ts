import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PodcastAdminAuthService } from './podcast-admin-auth.service';

describe('PodcastAdminAuthService', () => {
  it('accepts a verified classless Kiwi system-admin app token', async () => {
    const kiwi = client('admin');
    const service = new PodcastAdminAuthService(kiwi as unknown as KiwiMcpClient);

    await expect(service.authorize(bearer())).resolves.toMatchObject({
      userId: 'admin-1',
      accessToken: token(),
    });
    expect(kiwi.callTool).toHaveBeenCalledWith(token(), 'get_authenticated_user');
  });

  it('accepts a class-scoped Kiwi app token when Kiwi verifies a system admin', async () => {
    const kiwi = client('admin');
    const service = new PodcastAdminAuthService(kiwi as unknown as KiwiMcpClient);

    await expect(service.authorize(bearer({
      classId: 'class-1',
      tokenScope: 'class',
    }))).resolves.toMatchObject({
      userId: 'admin-1',
    });
  });

  it('accepts a legacy class-scoped admin token without the tokenScope claim', async () => {
    const service = new PodcastAdminAuthService(client('admin') as unknown as KiwiMcpClient);

    await expect(service.authorize(bearer({
      classId: 'class-1',
      tokenScope: undefined,
    }))).resolves.toMatchObject({
      userId: 'admin-1',
    });
  });

  it.each([undefined, '', 'token', 'Basic token', 'Bearer '])(
    'rejects a missing or malformed authorization header: %s',
    async (authorization) => {
      const service = new PodcastAdminAuthService(client('admin') as unknown as KiwiMcpClient);
      await expect(service.authorize(authorization)).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects a token Kiwi cannot authenticate', async () => {
    const kiwi = client('admin');
    kiwi.callTool.mockRejectedValueOnce(new Error('expired'));
    const service = new PodcastAdminAuthService(kiwi as unknown as KiwiMcpClient);
    await expect(service.authorize(bearer())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['wrong token type', { type: 'session' }, UnauthorizedException],
    ['wrong subject', { sub: 'other-user' }, UnauthorizedException],
    ['wrong app', { appSlug: 'other-app' }, ForbiddenException],
    ['classless token with class scope', { tokenScope: 'class' }, ForbiddenException],
    ['class token with admin scope', { classId: 'class-1', tokenScope: 'admin' }, ForbiddenException],
    ['empty class token context', { classId: '', tokenScope: 'class' }, ForbiddenException],
    ['missing token scope', { tokenScope: undefined }, ForbiddenException],
    ['expired token', { exp: Math.floor(Date.now() / 1000) - 1 }, UnauthorizedException],
  ] as const)('rejects %s', async (_label, overrides, errorType) => {
    const service = new PodcastAdminAuthService(client('admin') as unknown as KiwiMcpClient);
    await expect(service.authorize(bearer(overrides))).rejects.toBeInstanceOf(errorType);
  });

  it('rejects a non-admin Kiwi identity', async () => {
    const service = new PodcastAdminAuthService(client('instructor') as unknown as KiwiMcpClient);
    await expect(service.authorize(bearer())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.authorize(bearer({
      classId: 'class-1',
      tokenScope: 'class',
    }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires the podcast management scope and accepts a wildcard', async () => {
    const service = new PodcastAdminAuthService(client('admin') as unknown as KiwiMcpClient);
    await expect(
      service.authorize(bearer({ scopes: ['class:info:read'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.authorize(bearer({ scopes: ['podcast:*'] }))).resolves.toMatchObject({
      userId: 'admin-1',
    });
  });

  it('rejects malformed JWT claims after Kiwi authentication', async () => {
    const service = new PodcastAdminAuthService(client('admin') as unknown as KiwiMcpClient);
    await expect(service.authorize('Bearer not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function client(systemRole: string) {
  return {
    callTool: vi.fn().mockResolvedValue({ id: 'admin-1', systemRole }),
  };
}

function token(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'admin-1',
    type: 'app_token',
    appSlug: 'kiwi-podcast',
    classId: null,
    tokenScope: 'admin',
    scopes: ['podcast:manage'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  })).toString('base64url');
  return `${header}.${payload}.signature`;
}

function bearer(overrides: Record<string, unknown> = {}) {
  return `Bearer ${token(overrides)}`;
}
