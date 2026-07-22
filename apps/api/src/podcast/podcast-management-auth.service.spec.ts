import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { PodcastManagementAuthService } from './podcast-management-auth.service';

describe('PodcastManagementAuthService', () => {
  it.each(['admin', 'professor'] as const)('allows a verified %s with both scopes', async (role) => {
    const kiwi = client(role);
    const service = new PodcastManagementAuthService(kiwi as unknown as KiwiMcpClient);

    await expect(service.authorize('class-1', token())).resolves.toEqual({
      userId: 'user-1',
      role,
    });
    expect(kiwi.callTool).toHaveBeenCalledWith(expect.any(String), 'get_authenticated_user');
    expect(kiwi.getClassRole).toHaveBeenCalledWith('user-1', 'class-1');
  });

  it.each(['student', 'ta', null])('denies the effective Kiwi role %s', async (role) => {
    const service = new PodcastManagementAuthService(client(role) as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', token())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['wrong app', { appSlug: 'another-app' }],
    ['wrong class', { classId: 'class-2' }],
    ['missing management scope', { scopes: ['class:info:read'] }],
    ['missing role scope', { scopes: ['podcast:manage'] }],
  ])('denies %s claims', async (_label, overrides) => {
    const service = new PodcastManagementAuthService(client('admin') as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', token(overrides))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a subject that does not match Kiwi authenticated identity', async () => {
    const service = new PodcastManagementAuthService(client('admin') as unknown as KiwiMcpClient);
    await expect(service.authorize('class-1', token({ sub: 'someone-else' }))).rejects.toBeInstanceOf(UnauthorizedException);
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
  const payload = Buffer.from(JSON.stringify({
    sub: 'user-1',
    type: 'app_token',
    appSlug: 'kiwi-podcast',
    classId: 'class-1',
    scopes: ['podcast:manage', 'class:info:read'],
    ...overrides,
  })).toString('base64url');
  return `${header}.${payload}.signature`;
}
